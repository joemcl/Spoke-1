import React, { Component } from "react";
import PropTypes from "prop-types";
import Dialog from "material-ui/Dialog";
import FlatButton from "material-ui/FlatButton";
import _ from "lodash";

import IncomingMessageActions from "../../components/IncomingMessageActions";
import IncomingMessageFilter from "../../components/IncomingMessageFilter";
import IncomingMessageList from "../../components/IncomingMessageList";
import { UNASSIGNED_TEXTER, ALL_TEXTERS } from "../../lib/constants";
import LoadingIndicator from "../../components/LoadingIndicator";
import PaginatedCampaignsRetriever from "../PaginatedCampaignsRetriever";
import gql from "graphql-tag";
import loadData from "../hoc/load-data";
import { withRouter } from "react-router";
import wrapMutations from "../hoc/wrap-mutations";
import PaginatedUsersRetriever from "../PaginatedUsersRetriever";

function getCampaignsFilterForCampaignArchiveStatus(
  includeActiveCampaigns,
  includeArchivedCampaigns
) {
  let isArchived = undefined;
  if (!includeActiveCampaigns && includeArchivedCampaigns) {
    isArchived = true;
  } else if (
    (includeActiveCampaigns && !includeArchivedCampaigns) ||
    (!includeActiveCampaigns && !includeArchivedCampaigns)
  ) {
    isArchived = false;
  }

  if (isArchived !== undefined) {
    return { isArchived };
  }

  return {};
}

function getContactsFilterForConversationOptOutStatus(
  includeNotOptedOutConversations,
  includeOptedOutConversations
) {
  let isOptedOut = undefined;
  if (!includeNotOptedOutConversations && includeOptedOutConversations) {
    isOptedOut = true;
  } else if (
    (includeNotOptedOutConversations && !includeOptedOutConversations) ||
    (!includeNotOptedOutConversations && !includeOptedOutConversations)
  ) {
    isOptedOut = false;
  }

  if (isOptedOut !== undefined) {
    return { isOptedOut };
  }

  return {};
}

/* Initialized as objects to later facillitate shallow comparison */
const initialCampaignsFilter = { isArchived: false };
const initialContactsFilter = { isOptedOut: false };
const initialAssignmentsFilter = {};
const initialTagsFilter = {
  excludeEscalated: false,
  escalatedConvosOnly: false,
  specificTagIds: []
};

export class AdminIncomingMessageList extends Component {
  constructor(props) {
    super(props);

    const tagsFilter = props.escalatedConvosOnly
      ? Object.assign({}, initialTagsFilter, {
          excludeEscalated: false,
          escalatedConvosOnly: true
        })
      : initialTagsFilter;

    this.state = {
      page: 0,
      pageSize: 10,
      campaignsFilter: initialCampaignsFilter,
      contactsFilter: initialContactsFilter,
      assignmentsFilter: initialAssignmentsFilter,
      tagsFilter: tagsFilter,
      contactNameFilter: undefined,
      needsRender: false,
      campaigns: [],
      tags: [],
      reassignmentTexters: [],
      campaignTexters: [],
      includeArchivedCampaigns: false,
      conversationCount: 0,
      includeActiveCampaigns: true,
      includeNotOptedOutConversations: true,
      includeOptedOutConversations: false,
      selectedRows: [],
      campaignIdsContactIds: [],
      reassignmentAlert: undefined
    };
  }

  shouldComponentUpdate(dummy, nextState) {
    if (
      !nextState.needsRender &&
      _.isEqual(this.state.contactsFilter, nextState.contactsFilter) &&
      _.isEqual(this.state.campaignsFilter, nextState.campaignsFilter) &&
      _.isEqual(this.state.assignmentsFilter, nextState.assignmentsFilter) &&
      _.isEqual(this.state.tagsFilter, nextState, tagsFilter)
    ) {
      return false;
    }
    return true;
  }

  handleCampaignChanged = async campaignId => {
    const campaignsFilter = getCampaignsFilterForCampaignArchiveStatus(
      this.state.includeActiveCampaigns,
      this.state.includeArchivedCampaigns
    );
    if (campaignId !== -1) {
      campaignsFilter.campaignId = campaignId;
    }

    await this.setState({
      campaignsFilter,
      campaignIdsContactIds: [],
      needsRender: true
    });
  };

  handleTagsChanged = (_1, _2, values) => {
    this.setState(prevState => {
      const newTagsFilter = Object.assign({}, prevState.tagsFilter);
      newTagsFilter.specificTagIds = values;

      return {
        tagsFilter: newTagsFilter,
        campaignIdsContactIds: [],
        needsRender: true
      };
    });
  };

  handleTexterChanged = async texterId => {
    const assignmentsFilter = Object.assign({}, this.state.assignmentsFilter);
    if (texterId === UNASSIGNED_TEXTER) {
      assignmentsFilter.texterId = texterId;
    } else if (texterId === ALL_TEXTERS) {
      assignmentsFilter.texterId = undefined;
    } else {
      assignmentsFilter.texterId = texterId;
    }
    await this.setState({
      assignmentsFilter,
      campaignIdsContactIds: [],
      needsRender: true
    });
  };

  handleIncludeEscalatedToggled = () => {
    const tagsFilter = Object.assign({}, this.state.tagsFilter);
    tagsFilter.excludeEscalated = !(
      tagsFilter && !!tagsFilter.excludeEscalated
    );
    this.setState({ tagsFilter });
  };

  handleMessageFilterChange = async messagesFilter => {
    const contactsFilter = Object.assign(
      _.omit(this.state.contactsFilter, ["messageStatus"]),
      { messageStatus: messagesFilter }
    );
    await this.setState({
      contactsFilter,
      campaignIdsContactIds: [],
      needsRender: true
    });
  };

  searchByContactName = ({ firstName, lastName }) => {
    this.setState({
      contactNameFilter: { firstName, lastName },
      campaignIdsContactIds: [],
      needsRender: true
    });
  };

  closeReassignmentDialog = () =>
    this.setState({ reassignmentAlert: undefined });

  handleReassignmentCommon = async fn => {
    let newState = {
      needsRender: true,
      campaignIdsContactIds: [],
      reassignmentAlert: {
        title: "Success!",
        message: "Your reassignment request succeeded"
      }
    };

    try {
      await fn();
      newState.selectedRows = [];
    } catch (error) {
      newState.reassignmentAlert = {
        title: "Error",
        message: `There was an error: ${error}`
      };
    }

    this.setState(newState);
  };

  handleReassignRequested = async newTexterUserIds => {
    await this.handleReassignmentCommon(async () => {
      await this.props.mutations.megaReassignCampaignContacts(
        this.props.params.organizationId,
        this.state.campaignIdsContactIds,
        newTexterUserIds
      );
    });
  };

  handleReassignAllMatchingRequested = async newTexterUserIds => {
    await this.handleReassignmentCommon(async () => {
      await this.props.mutations.megaBulkReassignCampaignContacts(
        this.props.params.organizationId,
        this.state.campaignsFilter || {},
        this.state.assignmentsFilter || {},
        this.state.tagsFilter || {},
        this.state.contactsFilter || {},
        newTexterUserIds
      );
    });
  };

  handleUnassignRequested = async () => {
    await this.handleReassignmentCommon(async () => {
      await this.props.mutations.megaReassignCampaignContacts(
        this.props.params.organizationId,
        this.state.campaignIdsContactIds,
        null
      );
    });
  };

  handleUnassignAllMatchingRequested = async () => {
    await this.handleReassignmentCommon(async () => {
      await this.props.mutations.megaBulkReassignCampaignContacts(
        this.props.params.organizationId,
        this.state.campaignsFilter || {},
        this.state.assignmentsFilter || {},
        this.state.tagsFilter || {},
        this.state.contactsFilter || {},
        null
      );
    });
  };

  markForSecondPass = async () => {
    await this.props.mutations.markForSecondPass(
      this.props.params.organizationId,
      this.state.campaignIdsContactIds
    );

    this.setState({
      needsRender: true
    });
  };

  handlePageChange = async page => {
    await this.setState({
      page,
      needsRender: true
    });
  };

  handlePageSizeChange = async pageSize => {
    await this.setState({ needsRender: true, pageSize });
  };

  handleRowSelection = async (newSelectedRows, data) => {
    const isDeselectAll =
      this.state.selectedRows === "all" && newSelectedRows !== "all";
    this.setState({
      selectedRows: isDeselectAll ? [] : newSelectedRows,
      campaignIdsContactIds: isDeselectAll ? [] : data,
      needsRender: true
    });
  };

  handleCampaignsReceived = async campaigns => {
    this.setState({ campaigns, needsRender: true });
  };

  handleTagsReceived = async tagList => {
    this.setState({ tags: tagList });
  };

  handleCampaignTextersReceived = async campaignTexters => {
    this.setState({ campaignTexters, needsRender: true });
  };

  handleReassignmentTextersReceived = async reassignmentTexters => {
    this.setState({ reassignmentTexters, needsRender: true });
  };

  handleNotOptedOutConversationsToggled = async () => {
    if (
      this.state.includeNotOptedOutConversations &&
      !this.state.includeOptedOutConversations
    ) {
      return;
    }

    const contactsFilterUpdate = getContactsFilterForConversationOptOutStatus(
      !this.state.includeNotOptedOutConversations,
      this.state.includeOptedOutConversations
    );

    const contactsFilter = Object.assign(
      _.omit(this.state.contactsFilter, ["isOptedOut"]),
      contactsFilterUpdate
    );

    this.setState({
      contactsFilter,
      includeNotOptedOutConversations: !this.state
        .includeNotOptedOutConversations
    });
  };

  handleOptedOutConversationsToggled = async () => {
    const includeNotOptedOutConversations =
      this.state.includeNotOptedOutConversations ||
      !this.state.includeOptedOutConversations;

    const contactsFilterUpdate = getContactsFilterForConversationOptOutStatus(
      includeNotOptedOutConversations,
      !this.state.includeOptedOutConversations
    );

    const contactsFilter = Object.assign(
      _.omit(this.state.contactsFilter, ["isOptedOut"]),
      contactsFilterUpdate
    );

    this.setState({
      contactsFilter,
      includeNotOptedOutConversations,
      includeOptedOutConversations: !this.state.includeOptedOutConversations
    });
  };

  handleActiveCampaignsToggled = async () => {
    if (
      this.state.includeActiveCampaigns &&
      !this.state.includeArchivedCampaigns
    ) {
      return;
    }

    const campaignsFilter = getCampaignsFilterForCampaignArchiveStatus(
      !this.state.includeActiveCampaigns,
      this.state.includeArchivedCampaigns
    );
    this.setState({
      campaignsFilter,
      includeActiveCampaigns: !this.state.includeActiveCampaigns
    });
  };

  handleArchivedCampaignsToggled = async () => {
    const includeActiveCampaigns =
      this.state.includeActiveCampaigns || !this.state.includeArchivedCampaigns;

    const campaignsFilter = getCampaignsFilterForCampaignArchiveStatus(
      includeActiveCampaigns,
      !this.state.includeArchivedCampaigns
    );

    this.setState({
      campaignsFilter,
      includeActiveCampaigns,
      includeArchivedCampaigns: !this.state.includeArchivedCampaigns
    });
  };

  conversationCountChanged = conversationCount =>
    this.setState({ conversationCount, needsRender: true });

  /*
    Shallow comparison here done intentionally – we want to know if its changed, not if it's different,
    since we want to allow the user to make the same query as the default one, but we don't want to
    pre-emptively run the default (and most expensive) one
  */
  haveFiltersChangedFromDefaults = () => {
    const {
      campaignsFilter,
      contactsFilter,
      assignmentsFilter,
      tagsFilter,
      contactNameFilter
    } = this.state;
    return (
      campaignsFilter !== initialCampaignsFilter ||
      contactsFilter !== initialContactsFilter ||
      assignmentsFilter !== initialAssignmentsFilter ||
      tagsFilter !== initialTagsFilter ||
      contactNameFilter !== undefined
    );
  };

  render() {
    const {
      selectedRows,
      page,
      pageSize,
      reassignmentAlert,
      assignmentsFilter,
      tagsFilter
    } = this.state;
    const areContactsSelected =
      selectedRows === "all" ||
      (Array.isArray(selectedRows) && selectedRows.length > 0);

    const cursor = {
      offset: page * pageSize,
      limit: pageSize
    };

    const includeEscalated = tagsFilter && !tagsFilter.excludeEscalated;

    return (
      <div>
        <PaginatedUsersRetriever
          organizationId={this.props.params.organizationId}
          onUsersReceived={this.handleReassignmentTextersReceived}
          pageSize={1000}
        />
        <PaginatedUsersRetriever
          organizationId={this.props.params.organizationId}
          onUsersReceived={this.handleCampaignTextersReceived}
          pageSize={1000}
          campaignsFilter={this.state.campaignsFilter}
        />
        <PaginatedCampaignsRetriever
          organizationId={this.props.params.organizationId}
          campaignsFilter={_.pick(this.state.campaignsFilter, "isArchived")}
          onCampaignsReceived={this.handleCampaignsReceived}
          onTagsReceived={this.handleTagsReceived}
          pageSize={1000}
        />
        <IncomingMessageFilter
          campaigns={this.state.campaigns}
          texters={this.state.campaignTexters}
          tags={this.state.tags}
          onCampaignChanged={this.handleCampaignChanged}
          onTexterChanged={this.handleTexterChanged}
          includeEscalated={includeEscalated}
          onIncludeEscalatedChanged={this.handleIncludeEscalatedToggled}
          onMessageFilterChanged={this.handleMessageFilterChange}
          onTagsChanged={this.handleTagsChanged}
          searchByContactName={this.searchByContactName}
          assignmentsFilter={this.state.assignmentsFilter}
          tagsFilter={this.state.tagsFilter.specificTagIds}
          onActiveCampaignsToggled={this.handleActiveCampaignsToggled}
          onArchivedCampaignsToggled={this.handleArchivedCampaignsToggled}
          includeActiveCampaigns={this.state.includeActiveCampaigns}
          includeArchivedCampaigns={this.state.includeArchivedCampaigns}
          onNotOptedOutConversationsToggled={
            this.handleNotOptedOutConversationsToggled
          }
          onOptedOutConversationsToggled={
            this.handleOptedOutConversationsToggled
          }
          includeNotOptedOutConversations={
            this.state.includeNotOptedOutConversations
          }
          includeOptedOutConversations={this.state.includeOptedOutConversations}
          isTexterFilterable={!this.props.escalatedConvosOnly}
          isIncludeEscalatedFilterable={!this.props.escalatedConvosOnly}
        />
        <br />
        <IncomingMessageActions
          people={this.state.reassignmentTexters}
          onReassignRequested={this.handleReassignRequested}
          onReassignAllMatchingRequested={
            this.handleReassignAllMatchingRequested
          }
          onUnassignRequested={this.handleUnassignRequested}
          onUnassignAllMatchingRequested={
            this.handleUnassignAllMatchingRequested
          }
          markForSecondPass={this.markForSecondPass}
          contactsAreSelected={areContactsSelected}
          conversationCount={this.state.conversationCount}
        />
        <br />
        {this.haveFiltersChangedFromDefaults() ? (
          <IncomingMessageList
            organizationId={this.props.params.organizationId}
            cursor={cursor}
            contactsFilter={this.state.contactsFilter}
            campaignsFilter={this.state.campaignsFilter}
            assignmentsFilter={this.state.assignmentsFilter}
            tagsFilter={this.state.tagsFilter}
            includeEscalated={includeEscalated}
            contactNameFilter={this.state.contactNameFilter}
            selectedRows={this.state.selectedRows}
            onPageChanged={this.handlePageChange}
            onPageSizeChanged={this.handlePageSizeChange}
            onConversationSelected={this.handleRowSelection}
            onConversationCountChanged={this.conversationCountChanged}
          />
        ) : (
          <h3> Please select filters in order to start searching! </h3>
        )}
        <Dialog
          title={reassignmentAlert && reassignmentAlert.title}
          actions={[
            <FlatButton
              label="Ok"
              primary={true}
              onClick={this.closeReassignmentDialog}
            />
          ]}
          modal={false}
          open={!!reassignmentAlert}
          onRequestClose={this.closeReassignmentDialog}
        >
          {reassignmentAlert && reassignmentAlert.message}
        </Dialog>
      </div>
    );
  }
}

const mapMutationsToProps = () => ({
  reassignCampaignContacts: (
    organizationId,
    campaignIdsContactIds,
    newTexterUserId
  ) => ({
    mutation: gql`
      mutation reassignCampaignContacts(
        $organizationId: String!
        $campaignIdsContactIds: [CampaignIdContactId]!
        $newTexterUserId: String!
      ) {
        reassignCampaignContacts(
          organizationId: $organizationId
          campaignIdsContactIds: $campaignIdsContactIds
          newTexterUserId: $newTexterUserId
        ) {
          campaignId
          assignmentId
        }
      }
    `,
    variables: { organizationId, campaignIdsContactIds, newTexterUserId }
  }),

  megaReassignCampaignContacts: (
    organizationId,
    campaignIdsContactIds,
    newTexterUserIds
  ) => ({
    mutation: gql`
      mutation megaReassignCampaignContacts(
        $organizationId: String!
        $campaignIdsContactIds: [CampaignIdContactId]!
        $newTexterUserIds: [String]
      ) {
        megaReassignCampaignContacts(
          organizationId: $organizationId
          campaignIdsContactIds: $campaignIdsContactIds
          newTexterUserIds: $newTexterUserIds
        ) {
          campaignId
          assignmentId
        }
      }
    `,
    variables: { organizationId, campaignIdsContactIds, newTexterUserIds }
  }),

  markForSecondPass: (organizationId, campaignIdsContactIds) => ({
    mutation: gql`
      mutation markForSecondPass(
        $organizationId: String!
        $campaignIdsContactIds: [CampaignIdContactId]!
      ) {
        markForSecondPass(
          organizationId: $organizationId
          campaignIdsContactIds: $campaignIdsContactIds
        ) {
          id
        }
      }
    `,
    variables: { organizationId, campaignIdsContactIds }
  }),

  bulkReassignCampaignContacts: (
    organizationId,
    campaignsFilter,
    assignmentsFilter,
    tagsFilter,
    contactsFilter,
    newTexterUserId
  ) => ({
    mutation: gql`
      mutation bulkReassignCampaignContacts(
        $organizationId: String!
        $contactsFilter: ContactsFilter
        $campaignsFilter: CampaignsFilter
        $assignmentsFilter: AssignmentsFilter
        $tagsFilter: tagsFilter
        $newTexterUserId: String
      ) {
        bulkReassignCampaignContacts(
          organizationId: $organizationId
          contactsFilter: $contactsFilter
          campaignsFilter: $campaignsFilter
          assignmentsFilter: $assignmentsFilter
          tagsFilter: $tagsFilter
          newTexterUserId: $newTexterUserId
        ) {
          campaignId
          assignmentId
        }
      }
    `,
    variables: {
      organizationId,
      campaignsFilter,
      assignmentsFilter,
      tagsFilter,
      contactsFilter,
      newTexterUserId
    }
  }),

  megaBulkReassignCampaignContacts: (
    organizationId,
    campaignsFilter,
    assignmentsFilter,
    tagsFilter,
    contactsFilter,
    newTexterUserIds
  ) => ({
    mutation: gql`
      mutation megaBulkReassignCampaignContacts(
        $organizationId: String!
        $contactsFilter: ContactsFilter
        $campaignsFilter: CampaignsFilter
        $assignmentsFilter: AssignmentsFilter
        $tagsFilter: TagsFilter
        $newTexterUserIds: [String]
      ) {
        megaBulkReassignCampaignContacts(
          organizationId: $organizationId
          contactsFilter: $contactsFilter
          campaignsFilter: $campaignsFilter
          assignmentsFilter: $assignmentsFilter
          tagsFilter: $tagsFilter
          newTexterUserIds: $newTexterUserIds
        ) {
          campaignId
          assignmentId
        }
      }
    `,
    variables: {
      organizationId,
      campaignsFilter,
      assignmentsFilter,
      tagsFilter,
      contactsFilter,
      newTexterUserIds
    }
  })
});

AdminIncomingMessageList.propTypes = {
  mutations: PropTypes.object.isRequired,
  params: PropTypes.object.isRequired
};

export default loadData(withRouter(wrapMutations(AdminIncomingMessageList)), {
  mapMutationsToProps
});
