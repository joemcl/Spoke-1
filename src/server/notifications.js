import { config } from "../config";
import logger from "../logger";
import { eventBus, EventType } from "./event-bus";
import { r } from "./models";
import { sendEmail } from "./mail";

export const Notifications = Object.freeze({
  CAMPAIGN_STARTED: "campaign.started",
  ASSIGNMENT_MESSAGE_RECEIVED: "assignment.message.received",
  ASSIGNMENT_CREATED: "assignment.created",
  ASSIGNMENT_UPDATED: "assignment.updated"
});

async function getOrganizationOwner(organizationId) {
  return await r
    .reader("user")
    .join("user_organization", "user_organization.user_id", "user.id")
    .where({
      "user_organization.organization_id": organizationId,
      role: "OWNER"
    })
    .first("user.*");
}
const sendAssignmentUserNotification = async (assignment, notification) => {
  const campaign = await r
    .reader("campaign")
    .where({ id: assignment.campaign_id })
    .first();

  if (!campaign.is_started) {
    return;
  }

  const organization = await r
    .reader("organization")
    .where({ id: campaign.organization_id })
    .first();
  const user = await r
    .reader("organization")
    .where({ id: assignment.user_id })
    .first();
  const orgOwner = await getOrganizationOwner(organization.id);

  let subject;
  let text;
  if (notification === Notifications.ASSIGNMENT_UPDATED) {
    subject = `[${organization.name}] Updated assignment: ${campaign.title}`;
    text = `Your assignment changed: \n\n${config.BASE_URL}/app/${
      campaign.organization_id
    }/todos`;
  } else if (notification === Notifications.ASSIGNMENT_CREATED) {
    subject = `[${organization.name}] New assignment: ${campaign.title}`;
    text = `You just got a new texting assignment from ${
      organization.name
    }. You can start sending texts right away: \n\n${config.BASE_URL}/app/${
      campaign.organization_id
    }/todos`;
  }

  try {
    await sendEmail({
      to: user.email,
      replyTo: orgOwner.email,
      subject,
      text
    });
  } catch (e) {
    logger.error("Error sending assignment notification email", e);
  }
};

export const sendUserNotification = async notification => {
  const { type } = notification;

  // Fine-grained notification preferences
  let disabledTypes = config.DISABLED_TEXTER_NOTIFICATION_TYPES;
  disabledTypes = disabledTypes.length > 0 ? disabledTypes.split(",") : [];
  if (disabledTypes.includes(type)) return;

  if (type === Notifications.CAMPAIGN_STARTED) {
    const assignments = await r
      .reader("assignment")
      .where({ campaign_id: notification.campaignId })
      .pluck(["user_id", "campaign_id"]);

    const count = assignments.length;
    for (let i = 0; i < count; i++) {
      const assignment = assignments[i];
      await sendAssignmentUserNotification(
        assignment,
        Notifications.ASSIGNMENT_CREATED
      );
    }
    return;
  }

  // Global notification toggle (campaign notifications are still allowed)
  if (config.DISABLE_TEXTER_NOTIFICATIONS) return;

  if (type === Notifications.ASSIGNMENT_MESSAGE_RECEIVED) {
    const assignment = await r
      .reader("assignment")
      .where({ id: notification.assignmentId })
      .first();
    const campaign = await r
      .reader("campaign")
      .where({ id: assignment.campaign_id })
      .first();
    const campaignContact = await r
      .reader("campaign_contact")
      .where({ campaign_id: campaign.id, cell: notification.contactNumber })
      .first();

    if (!campaignContact.is_opted_out && !campaign.is_archived) {
      const user = await r
        .reader("user")
        .where({ id: assignment.user_id })
        .first();
      const organization = await r
        .reader("organization")
        .where({ id: campaign.organization_id })
        .first();
      const orgOwner = await getOrganizationOwner(organization.id);

      try {
        await sendEmail({
          to: user.email,
          replyTo: orgOwner.email,
          subject: `[${organization.name}] [${campaign.title}] New reply`,
          text: `Someone responded to your message. See all your replies here: \n\n${
            config.BASE_URL
          }/app/${campaign.organization_id}/todos/${
            notification.assignmentId
          }/reply`
        });
      } catch (e) {
        logger.error("Error sending conversation reply notification email", e);
      }
    }
  } else if (type === Notifications.ASSIGNMENT_CREATED) {
    const { assignment } = notification;
    await sendAssignmentUserNotification(assignment, type);
  } else if (type == Notifications.ASSIGNMENT_UPDATED) {
    const { assignment } = notification;
    await sendAssignmentUserNotification(assignment, type);
  }
};

const handleAssignmentCreated = assignment =>
  sendUserNotification({
    type: Notifications.ASSIGNMENT_CREATED,
    assignment
  });

const handleMessageReceived = ({ assignmentId, contactNumber }) =>
  sendUserNotification({
    type: Notifications.ASSIGNMENT_MESSAGE_RECEIVED,
    assignmentId,
    contactNumber
  });

// Ensure observers are only set up once
let isNotificationObservationSetUp = false;
export const setupUserNotificationObservers = () => {
  if (isNotificationObservationSetUp) return;

  eventBus.on(EventType.AssignmentCreated, handleAssignmentCreated);
  eventBus.on(EventType.MessageReceived, handleMessageReceived);

  isNotificationObservationSetUp = true;
};
