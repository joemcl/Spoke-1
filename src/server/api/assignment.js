import moment from "moment-timezone";
import request from "superagent";
import _ from "lodash";

import logger from "../../logger";
import { config } from "../../config";
import { sqlResolvers } from "./lib/utils";
import { sleep } from "../../lib/utils";
import { isNowBetween } from "../../lib/timezones";
import { r, cacheableData } from "../models";
import { eventBus, EventType } from "../event-bus";

class AutoassignError extends Error {
  constructor(message, isFatal = false) {
    super(message);
    this.isFatal = isFatal;
  }
}

export function addWhereClauseForContactsFilterMessageStatusIrrespectiveOfPastDue(
  queryParameter,
  messageStatusFilter
) {
  if (!messageStatusFilter) {
    return queryParameter;
  }

  let query = queryParameter;
  if (messageStatusFilter === "needsMessageOrResponse") {
    query.whereIn("message_status", ["needsResponse", "needsMessage"]);
  } else {
    query = query.whereIn("message_status", messageStatusFilter.split(","));
  }
  return query;
}

/**
 * Given query parameters, an assignment record, and its associated records, build a Knex query
 * to fetch contacts eligible for contacting _now_ by a particular user given filter constraints.
 * @param {object} assignment The assignment record to fetch contacts for
 * @param {object} contactsFilter A filter object
 * @param {object} organization The record of the organization of the assignment's campaign
 * @param {object} campaign The record of the campaign the assignment is part of
 * @param {boolean} forCount When `true`, return a count(*) query
 * @returns {Knex} The Knex query
 */
export function getContacts(
  assignment,
  contactsFilter,
  organization,
  campaign,
  forCount = false
) {
  // 24-hours past due - why is this 24 hours offset?
  const includePastDue = contactsFilter && contactsFilter.includePastDue;
  const pastDue =
    campaign.due_by &&
    Number(campaign.due_by) + 24 * 60 * 60 * 1000 < Number(new Date());

  if (
    !includePastDue &&
    pastDue &&
    contactsFilter &&
    contactsFilter.messageStatus === "needsMessage"
  ) {
    return [];
  }

  let query = r
    .reader("campaign_contact")
    .where({
      campaign_id: campaign.id,
      assignment_id: assignment.id
    })
    .whereRaw(`archived = ${campaign.is_archived}`); // partial index friendly

  if (contactsFilter) {
    const validTimezone = contactsFilter.validTimezone;
    if (validTimezone !== null) {
      const {
        texting_hours_start: textingHoursStart,
        texting_hours_end: textingHoursEnd,
        timezone: campaignTimezone
      } = campaign;

      const isCampaignTimezoneValid = isNowBetween(
        campaignTimezone,
        textingHoursStart,
        textingHoursEnd
      );

      if (validTimezone === true) {
        query = query.whereRaw(
          "contact_is_textable_now(timezone, ?, ?, ?) = true",
          [textingHoursStart, textingHoursEnd, isCampaignTimezoneValid]
        );
      } else if (validTimezone === false) {
        // validTimezone === false means we're looking for an invalid timezone,
        // which means the contact is NOT textable right now
        query = query.whereRaw(
          "contact_is_textable_now(timezone, ?, ?, ?) is distinct from true",
          [textingHoursStart, textingHoursEnd, isCampaignTimezoneValid]
        );
      }
    }

    query = addWhereClauseForContactsFilterMessageStatusIrrespectiveOfPastDue(
      query,
      (contactsFilter && contactsFilter.messageStatus) ||
        (pastDue
          ? // by default if asking for 'send later' contacts we include only those that need replies
            "needsResponse"
          : // we do not want to return closed/messaged
            "needsMessageOrResponse")
    );

    if (Object.prototype.hasOwnProperty.call(contactsFilter, "isOptedOut")) {
      query = query.where("is_opted_out", contactsFilter.isOptedOut);
    }
  }

  // Don't bother ordering the results if we only want the count
  if (!forCount) {
    if (contactsFilter && contactsFilter.messageStatus === "convo") {
      query = query.orderByRaw("message_status DESC, updated_at DESC");
    } else {
      query = query.orderByRaw("message_status DESC, updated_at");
    }
  }

  return query;
}

// Returns either "replies", "initials", or null
export async function getCurrentAssignmentType(organizationId) {
  const organization = await r
    .reader("organization")
    .select("features")
    .where({ id: parseInt(organizationId) })
    .first();

  const features = {};
  try {
    const parsed = JSON.parse(organization.features);
    Object.assign(features, parsed);
  } catch (ex) {
    // do nothing
  }

  return {
    assignmentType: features.textRequestType,
    generalEnabled: features.textRequestFormEnabled || false,
    orgMaxRequestCount: features.textRequestMaxCount || 0
  };
}

export async function allCurrentAssignmentTargets(organizationId) {
  const { assignmentType, generalEnabled } = await getCurrentAssignmentType(
    organizationId
  );

  const campaignView = {
    UNREPLIED: "assignable_campaigns_with_needs_reply",
    UNSENT: "assignable_campaigns_with_needs_message"
  }[assignmentType];

  const contactsView = {
    UNREPLIED: "assignable_needs_reply",
    UNSENT: "assignable_needs_message"
  }[assignmentType];

  if (!campaignView || !contactsView) {
    return [];
  }

  const generalEnabledBit = generalEnabled ? 1 : 0;

  /**
   * The second part of the union needs to be in parenthesis
   * so that the limit applies only to it and not the whole
   * query
   */
  const { rows: teamToCampaigns } = await r.reader.raw(
    /**
     * What a query!
     *
     * General is set to priority 0 here so that it shows up at the top of the page display
     * @> is the Postgresql array includes operator
     * ARRAY[1,2,3] @> ARRAY[1,2] is true
     */
    `
    with team_assignment_options as (
      select *
      from team
      where organization_id = ?
    ),
    needs_message_teams as (
      select * from team_assignment_options
      where assignment_type = 'UNSENT'
    ),
    needs_reply_teams as (
      select
        team_assignment_options.*,
        (
          select array_agg(tag_id)
          from team_escalation_tags
          where team_id = team_assignment_options.id
        ) as this_teams_escalation_tags
      from team_assignment_options
      where assignment_type = 'UNREPLIED'
    ),
    needs_message_team_campaign_pairings as (
      select
          teams.assignment_priority as priority,
          teams.id as team_id,
          teams.title as team_title,
          teams.is_assignment_enabled as enabled,
          teams.assignment_type,
          campaign.id as id, campaign.title
      from needs_message_teams as teams
      join campaign_team on campaign_team.team_id = teams.id
      join campaign on campaign.id = (
        select id
        from assignable_campaigns_with_needs_message as campaigns
        where campaigns.id = campaign_team.campaign_id
        order by id asc
        limit 1
      )
    ),
    needs_reply_team_campaign_pairings as (
      select
          teams.assignment_priority as priority,
          teams.id as team_id,
          teams.title as team_title,
          teams.is_assignment_enabled as enabled,
          teams.assignment_type,
          campaign.id as id, campaign.title
      from needs_reply_teams as teams
      join campaign_team on campaign_team.team_id = teams.id
      join campaign on campaign.id = (
        select id
        from assignable_campaigns_with_needs_reply as campaigns
        where campaigns.id = campaign_team.campaign_id
        order by id asc
        limit 1
      )
    ),
    custom_escalation_campaign_pairings as (
      select
        teams.assignment_priority as priority,
        teams.id as team_id,
        teams.title as team_title,
        teams.is_assignment_enabled as enabled,
        teams.assignment_type,
        campaign.id as id, campaign.title
      from needs_reply_teams as teams
      join campaign on campaign.id = (
        select id
        from assignable_campaigns as campaigns
        where exists (
          select 1
          from assignable_needs_reply_with_escalation_tags
          where campaign_id = campaigns.id
            and teams.this_teams_escalation_tags @> applied_escalation_tags
            -- @> is true if teams.this_teams_escalation_tags has every member of applied_escalation_tags
        )
        and (
          campaigns.limit_assignment_to_teams = false
          or
          exists (
            select 1
            from campaign_team
            where campaign_team.team_id = teams.id
              and campaign_team.campaign_id = campaigns.id
          )
        )
        order by id asc
        limit 1
      )
    ),
    general_campaign_pairing as (
      select
        0 as priority, -1 as team_id, 'General' as team_title,
        ${generalEnabledBit}::boolean as enabled,
        '${assignmentType}' as assignment_type,
        campaigns.id, campaigns.title
      from ${campaignView} as campaigns
      where campaigns.limit_assignment_to_teams = false
          and organization_id = ?
      order by id asc
      limit 1
    ),
    all_campaign_pairings as (
      (
        select needs_message_team_campaign_pairings.*, (
          select count(*)
          from assignable_needs_message
          where campaign_id = needs_message_team_campaign_pairings.id
        ) as count_left
        from needs_message_team_campaign_pairings
      )
      union
      (
        select needs_reply_team_campaign_pairings.*, (
          select count(*)
          from assignable_needs_reply
          where campaign_id = needs_reply_team_campaign_pairings.id
        ) as count_left
        from needs_reply_team_campaign_pairings
        where team_id not in (
          select team_id
          from custom_escalation_campaign_pairings
        )
      )
      union
      (
        select custom_escalation_campaign_pairings.*, (
          select count(distinct id)
          from 
          (
            (
              select id
              from assignable_needs_reply
              where campaign_id = custom_escalation_campaign_pairings.id
            ) union (
              select id
              from assignable_needs_reply_with_escalation_tags
              where campaign_id = custom_escalation_campaign_pairings.id
            )
          ) all_assignable_for_campaign
        ) as count_left
        from custom_escalation_campaign_pairings
      )
      union
      (
        select general_campaign_pairing.*, (
          select count(*)
          from ${contactsView}
          where campaign_id = general_campaign_pairing.id
        ) as count_left
        from general_campaign_pairing
      )
    )
    select *
    from all_campaign_pairings
    order by priority asc`,
    [organizationId, organizationId]
  );

  return teamToCampaigns;
}

export async function myCurrentAssignmentTargets(
  userId,
  organizationId,
  trx = r.knex
) {
  const {
    assignmentType,
    generalEnabled,
    orgMaxRequestCount
  } = await getCurrentAssignmentType(organizationId);

  const campaignView = {
    UNREPLIED: "assignable_campaigns_with_needs_reply",
    UNSENT: "assignable_campaigns_with_needs_message"
  }[assignmentType];

  const contactsView = {
    UNREPLIED: "assignable_needs_reply",
    UNSENT: "assignable_needs_message"
  }[assignmentType];

  if (!campaignView || !contactsView) {
    return null;
  }

  const generalEnabledBit = generalEnabled ? 1 : 0;

  const { rows: teamToCampaigns } = await trx.raw(
    /**
     * This query is the same as allCurrentAssignmentTargets, except
     *  - it restricts teams to those with is_assignment_enabled = true via the where clause in team_assignment_options
     *  - it adds all_possible_team_assignments to set up my_possible_team_assignments
     *
     * @> is the Postgresql array includes operator
     * ARRAY[1,2,3] @> ARRAY[1,2] is true
     */
    `
      with team_assignment_options as (
        select *
        from team
        where organization_id = ?
          and is_assignment_enabled = true
          and exists (
            select 1
            from user_team
            where team_id = team.id
              and user_id = ?
          )         
      ),
      my_escalation_tags as (
        select array_agg(tag_id) as my_escalation_tags
        from team_escalation_tags
        where exists (
          select 1
          from user_team
          where user_team.team_id = team_escalation_tags.team_id
            and user_id = ?
        )
      ),
      needs_message_teams as (
        select * from team_assignment_options
        where assignment_type = 'UNSENT'
      ),
      needs_reply_teams as (
        select * from team_assignment_options
        where assignment_type = 'UNREPLIED'
      ),
      needs_message_team_campaign_pairings as (
        select
            teams.assignment_priority as priority,
            teams.id as team_id,
            teams.title as team_title,
            teams.is_assignment_enabled as enabled,
            teams.assignment_type,
            teams.max_request_count,
            campaign.id as id, campaign.title
        from needs_message_teams as teams
        join campaign_team on campaign_team.team_id = teams.id
        join campaign on campaign.id = (
          select id
          from assignable_campaigns_with_needs_message as campaigns
          where campaigns.id = campaign_team.campaign_id
          order by id asc
          limit 1
        )
      ),
      needs_reply_team_campaign_pairings as (
        select
            teams.assignment_priority as priority,
            teams.id as team_id,
            teams.title as team_title,
            teams.is_assignment_enabled as enabled,
            teams.assignment_type,
            teams.max_request_count,
            campaign.id as id, campaign.title
        from needs_reply_teams as teams
        join campaign_team on campaign_team.team_id = teams.id
        join campaign on campaign.id = (
          select id
          from assignable_campaigns_with_needs_reply as campaigns
          where campaigns.id = campaign_team.campaign_id
          order by id asc
          limit 1
        )
      ),
      custom_escalation_campaign_pairings as (
        select
          teams.assignment_priority as priority,
          teams.id as team_id,
          teams.title as team_title,
          teams.is_assignment_enabled as enabled,
          teams.assignment_type,
          teams.max_request_count,
          campaign.id as id, campaign.title
        from needs_reply_teams as teams
        join campaign on campaign.id = (
          select id
          from assignable_campaigns as campaigns
          where exists (
            select 1
            from assignable_needs_reply_with_escalation_tags
            join my_escalation_tags on true
            where campaign_id = campaigns.id
              and my_escalation_tags.my_escalation_tags @> applied_escalation_tags
              and (
                campaigns.limit_assignment_to_teams = false
                or
                exists (
                  select 1
                  from campaign_team
                  where campaign_team.team_id = teams.id
                    and campaign_team.campaign_id = campaigns.id
                )
              )
            )
          order by id asc
          limit 1
        )
      ),
      general_campaign_pairing as (
        select
          '+infinity'::float as priority, -1 as team_id, 
          'General' as team_title, 
          ${generalEnabledBit}::boolean as enabled, 
          '${assignmentType}' as assignment_type, 
          ${orgMaxRequestCount} as max_request_count,
          campaigns.id, campaigns.title
        from ${campaignView} as campaigns
        where campaigns.limit_assignment_to_teams = false
            and organization_id = ?
        order by id asc
        limit 1
      ),
      all_possible_team_assignments as (
        ( select * from needs_message_team_campaign_pairings )
        union
        ( select * from needs_reply_team_campaign_pairings )
        union
        ( select * from custom_escalation_campaign_pairings )
        union
        ( select * from general_campaign_pairing )
      )
      select * from all_possible_team_assignments
      where enabled = true
      order by priority, id asc`,
    [organizationId, userId, userId, organizationId]
  );

  const results = teamToCampaigns.map(ttc =>
    Object.assign(ttc, {
      type: ttc.assignment_type,
      campaign: { id: ttc.id, title: ttc.title },
      count_left: 0
    })
  );

  return results;
}

export async function myCurrentAssignmentTarget(
  userId,
  organizationId,
  trx = r.knex
) {
  const options = await myCurrentAssignmentTargets(userId, organizationId, trx);
  return options ? options[0] : null;
}

async function notifyIfAllAssigned(organizationId, teamsAssignedTo) {
  if (config.ASSIGNMENT_COMPLETE_NOTIFICATION_URL) {
    const assignmentTargets = await allCurrentAssignmentTargets(organizationId);
    const existingTeamIds = assignmentTargets.map(cat => cat.team_id);

    const isEmptiedTeam = ([id, _title]) => !existingTeamIds.includes(id);
    let emptiedTeams = [...teamsAssignedTo.entries()].filter(isEmptiedTeam);

    let notificationTeamIds = config.ASSIGNMENT_COMPLETE_NOTIFICATION_TEAM_IDS;
    if (notificationTeamIds.length > 0) {
      notificationTeamIds = notificationTeamIds.split(",").map(parseInt);
      const isANotifyTeam = ([id, _title]) => notificationTeamIds.includes(id);
      emptiedTeams = emptiedTeams.filter(isANotifyTeam);
    }

    await Promise.all(
      emptiedTeams.map(([_id, title]) =>
        request
          .post(config.ASSIGNMENT_COMPLETE_NOTIFICATION_URL)
          .timeout(30000)
          .send({ team: title })
      )
    );
  } else {
    logger.verbose(
      "Not checking if assignments are available – ASSIGNMENT_COMPLETE_NOTIFICATION_URL is unset"
    );
  }
}

export async function fulfillPendingRequestFor(auth0Id) {
  const user = await r
    .knex("user")
    .first("id")
    .where({ auth0_id: auth0Id });

  if (!user) {
    throw new AutoassignError(`No user found with id ${auth0Id}`);
  }

  // External assignment service may not be organization-aware so we default to the highest organization ID
  const pendingAssignmentRequest = await r
    .knex("assignment_request")
    .where({ status: "pending", user_id: user.id })
    .orderBy("organization_id", "desc")
    .first("*");

  if (!pendingAssignmentRequest) {
    throw new AutoassignError(`No pending request exists for ${auth0Id}`);
  }

  const numberAssigned = await r.knex.transaction(async trx => {
    try {
      const numberAssigned = await giveUserMoreTexts(
        auth0Id,
        pendingAssignmentRequest.amount,
        pendingAssignmentRequest.organization_id,
        pendingAssignmentRequest.preferred_team_id,
        trx
      );

      await trx("assignment_request")
        .update({
          status: "approved"
        })
        .where({ id: pendingAssignmentRequest.id });

      return numberAssigned;
    } catch (err) {
      logger.info(
        `Failed to give user ${auth0Id} more texts. Marking their request as rejected. `,
        err
      );

      // Mark as rejected outside the transaction so it is unaffected by the rollback
      await r
        .knex("assignment_request")
        .update({
          status: "rejected"
        })
        .where({ id: pendingAssignmentRequest.id });

      const isFatal = err.isFatal !== undefined ? err.isFatal : true;
      throw new AutoassignError(err.message, isFatal);
    }
  });

  return numberAssigned;
}

export async function giveUserMoreTexts(
  auth0Id,
  count,
  organizationId,
  preferredTeamId,
  parentTrx = r.knex
) {
  logger.verbose(`Starting to give ${auth0Id} ${count} texts`);

  const matchingUsers = await r.knex("user").where({ auth0_id: auth0Id });
  const user = matchingUsers[0];
  if (!user) {
    throw new AutoassignError(`No user found with id ${auth0Id}`);
  }

  const assignmentInfo = await myCurrentAssignmentTarget(
    user.id,
    organizationId
  );

  if (!assignmentInfo) {
    throw new AutoassignError(
      "Could not find a suitable campaign to assign to."
    );
  }

  // Use a Map to de-duplicate and support integer-type keys
  const teamsAssignedTo = new Map();
  let countUpdated = 0;
  let countLeftToUpdate = count;

  const updated_result = await parentTrx.transaction(async trx => {
    while (countLeftToUpdate > 0) {
      const { count: countUpdatedInLoop, team } = await assignLoop(
        user,
        organizationId,
        countLeftToUpdate,
        preferredTeamId,
        trx
      );

      countLeftToUpdate = countLeftToUpdate - countUpdatedInLoop;
      countUpdated = countUpdated + countUpdatedInLoop;

      if (countUpdatedInLoop === 0) {
        if (countUpdated === 0) {
          throw new AutoassignError(
            "Could not find a suitable campaign to assign to."
          );
        } else {
          return countUpdated;
        }
      }

      const { teamId, teamTitle } = team;
      teamsAssignedTo.set(teamId, teamTitle);
    }

    return countUpdated;
  });

  if (teamsAssignedTo.size > 0) {
    // Hold off notifying until the current transaction has commited and propagated to any readers
    // No need to await the notify result as giveUserMoreTexts doesn't depend on it
    sleep(15000)
      .then(() => notifyIfAllAssigned(organizationId, teamsAssignedTo))
      .catch(err =>
        logger.error("Encountered error notifying assignment complete: ", err)
      );
  }

  return updated_result;
}

export async function assignLoop(
  user,
  organizationId,
  countLeft,
  preferredTeamId,
  trx
) {
  const assignmentOptions = await myCurrentAssignmentTargets(
    user.id,
    organizationId,
    trx
  );

  if (assignmentOptions.length === 0) {
    return { count: 0 };
  }

  const preferredAssignment = assignmentOptions.find(
    assignment => assignment.team_id === preferredTeamId
  );

  const assignmentInfo = preferredAssignment || assignmentOptions[0];

  // Determine which campaign to assign to – optimize to pick winners
  let campaignIdToAssignTo = assignmentInfo.campaign.id;
  let countToAssign = countLeft;
  logger.info(
    `Assigning ${countToAssign} on campaign ${campaignIdToAssignTo} of type ${
      assignmentInfo.type
    }`
  );

  // Assign a max of `count` contacts in `campaignIdToAssignTo` to `user`
  let assignmentId;
  const existingAssignment = await trx("assignment")
    .where({
      user_id: user.id,
      campaign_id: campaignIdToAssignTo
    })
    .first();

  if (!existingAssignment) {
    const [newAssignment] = await trx("assignment")
      .insert({
        user_id: user.id,
        campaign_id: campaignIdToAssignTo
      })
      .returning("*");
    eventBus.emit(EventType.AssignmentCreated, newAssignment);
    assignmentId = newAssignment.id;
  } else {
    assignmentId = existingAssignment.id;
  }

  logger.verbose(`Assigning to assignment id ${assignmentId}`);

  const contactView = {
    UNREPLIED: `( 
      select id, campaign_id
      from campaign_contact
      where id in ( select id from assignable_needs_reply )
        or id in ( 
          select id
          from assignable_needs_reply_with_escalation_tags
          where applied_escalation_tags <@ (
            select array_agg(tag_id) as my_escalation_tags
            from team_escalation_tags
            where exists (
              select 1
              from user_team
              where user_team.team_id = team_escalation_tags.team_id
                and user_id = ?
            )
          )
        )
      ) all_needs_reply`,
    UNSENT: "assignable_needs_message"
  }[assignmentInfo.type];

  const queryVars =
    assignmentInfo.type == "UNREPLIED"
      ? [user.id, campaignIdToAssignTo, countToAssign, assignmentId]
      : [campaignIdToAssignTo, countToAssign, assignmentId];

  const { rowCount: ccUpdateCount } = await trx.raw(
    `
      with matching_contact as (
        select id from ${contactView}
        where campaign_id = ?
        for update skip locked
        limit ?
      )
      update
         campaign_contact as target_contact
       set
         assignment_id = ?
       from
         matching_contact
       where
         target_contact.id = matching_contact.id;`,
    queryVars
  );

  logger.verbose(`Updated ${ccUpdateCount} campaign contacts`);
  const team = {
    teamId: assignmentInfo.team_id,
    teamTitle: assignmentInfo.team_title
  };
  return { count: ccUpdateCount, team };
}

export const resolvers = {
  Assignment: {
    ...sqlResolvers(["id", "maxContacts"]),
    texter: async (assignment, _, { loaders }) =>
      assignment.texter
        ? assignment.texter
        : loaders.user.load(assignment.user_id),
    campaign: async (assignment, _, { loaders }) =>
      loaders.campaign.load(assignment.campaign_id),
    contactsCount: async (assignment, { contactsFilter }) => {
      const campaign = await r
        .reader("campaign")
        .where({ id: assignment.campaign_id })
        .first();
      const organization = await r
        .reader("organization")
        .where({ id: campaign.organization_id })
        .first();

      return await r.getCount(
        getContacts(assignment, contactsFilter, organization, campaign, true)
      );
    },
    contacts: async (assignment, { contactsFilter }) => {
      const campaign = await r
        .reader("campaign")
        .where({ id: assignment.campaign_id })
        .first();

      const organization = await r
        .reader("organization")
        .where({ id: campaign.organization_id })
        .first();
      return getContacts(assignment, contactsFilter, organization, campaign);
    },
    campaignCannedResponses: async assignment =>
      await cacheableData.cannedResponse.query({
        userId: "",
        campaignId: assignment.campaign_id
      }),
    userCannedResponses: async assignment =>
      await cacheableData.cannedResponse.query({
        userId: assignment.user_id,
        campaignId: assignment.campaign_id
      })
  }
};
