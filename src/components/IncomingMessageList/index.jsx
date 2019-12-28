import React, { Component } from "react";
import type from "prop-types";
import FlatButton from "material-ui/FlatButton";
import ActionOpenInNew from "material-ui/svg-icons/action/open-in-new";
import loadData from "../../containers/hoc/load-data";
import { withRouter } from "react-router";
import gql from "graphql-tag";
import LoadingIndicator from "../../components/LoadingIndicator";
import DataTables from "material-ui-datatables";
import ConversationPreviewModal from "./ConversationPreviewModal";

import { MESSAGE_STATUSES } from "../../components/IncomingMessageFilter";

const formatContactName = contact => {
  const { firstName, lastName, optOut } = contact;
  const suffix = optOut && optOut.cell ? " ⛔" : "";
  return `${firstName} ${lastName}${suffix}`;
};

const prepareDataTableData = conversations =>
  conversations.map((conversation, index) => ({
    campaignTitle: conversation.campaign.title,
    texter: conversation.texter.displayName,
    to: formatContactName(conversation.contact),
    status: conversation.contact.messageStatus,
    messages: conversation.contact.messages,
    updatedAt: conversation.contact.updatedAt,
    index
  }));

function prepareSelectedRowsData(conversations, rowsSelected) {
  let selection = rowsSelected;
  if (rowsSelected === "all") {
    selection = Array.from(Array(conversations.length).keys());
  } else if (rowsSelected === "none") {
    selection = [];
  }

  return selection.map(selectedIndex => {
    const conversation = conversations[selectedIndex];
    return {
      campaignId: conversation.campaign.id,
      campaignContactId: conversation.contact.id,
      messageIds: conversation.contact.messages.map(message => message.id)
    };
  });
}

export class IncomingMessageList extends Component {
  state = {
    activeConversationIndex: -1
  };

  componentDidUpdate(prevProps) {
    let previousPageInfo = { total: 0 };
    if (prevProps.conversations.conversations) {
      previousPageInfo = prevProps.conversations.conversations.pageInfo;
    }

    let pageInfo = { total: 0 };
    if (this.props.conversations.conversations) {
      pageInfo = this.props.conversations.conversations.pageInfo;
    }

    if (
      previousPageInfo.total !== pageInfo.total ||
      (!previousPageInfo && pageInfo)
    ) {
      this.props.onConversationCountChanged(pageInfo.total);
    }
  }

  prepareTableColumns = () => {
    return [
      {
        key: "campaignTitle",
        label: "Campaign",
        style: {
          textOverflow: "ellipsis",
          overflow: "hidden",
          whiteSpace: "pre-line"
        }
      },
      {
        key: "texter",
        label: "Texter",
        style: {
          textOverflow: "ellipsis",
          overflow: "scroll",
          whiteSpace: "pre-line"
        }
      },
      {
        key: "to",
        label: "To",
        style: {
          textOverflow: "ellipsis",
          overflow: "scroll",
          whiteSpace: "pre-line"
        }
      },
      {
        key: "status",
        label: "Conversation Status",
        style: {
          textOverflow: "ellipsis",
          overflow: "scroll",
          whiteSpace: "pre-line"
        },
        render: (columnKey, row) => MESSAGE_STATUSES[row.status].name
      },
      {
        key: "updatedAt",
        label: "Last Updated At",
        style: {
          textOverflow: "ellipsis",
          overflow: "scroll",
          whiteSpace: "pre-line"
        },
        render: (columnKey, row) => new Date(row.updatedAt).toLocaleString()
      },
      {
        key: "latestMessage",
        label: "Latest Message",
        style: {
          textOverflow: "ellipsis",
          overflow: "scroll",
          whiteSpace: "pre-line"
        },
        render: (columnKey, row) => {
          let lastMessage = null;
          let lastMessageEl = <p>No Messages</p>;
          if (row.messages && row.messages.length > 0) {
            lastMessage = row.messages[row.messages.length - 1];
            lastMessageEl = (
              <p
                style={{
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  whiteSpace: "nowrap"
                }}
              >
                <span
                  style={{
                    color: lastMessage.isFromContact ? "blue" : "black"
                  }}
                >
                  <b>{lastMessage.isFromContact ? "Contact:" : "Texter:"} </b>
                </span>
                {lastMessage.text}
              </p>
            );
          }
          return lastMessageEl;
        }
      },
      {
        key: "viewConversation",
        label: "View Conversation",
        style: {
          textOverflow: "ellipsis",
          overflow: "scroll",
          whiteSpace: "pre-line"
        },
        render: (columnKey, row) => {
          if (row.messages && row.messages.length > 0) {
            return (
              <FlatButton
                onClick={event => {
                  event.stopPropagation();
                  this.handleOpenConversation(row.index);
                }}
                icon={<ActionOpenInNew />}
              />
            );
          }
          return "";
        }
      }
    ];
  };

  handleNextPageClick = () => {
    const {
      limit,
      offset,
      total
    } = this.props.conversations.conversations.pageInfo;
    const currentPage = Math.floor(offset / limit);
    const maxPage = Math.floor(total / limit);
    const newPage = Math.min(maxPage, currentPage + 1);
    this.props.onPageChanged(newPage);
  };

  handlePreviousPageClick = () => {
    const { limit, offset } = this.props.conversations.conversations.pageInfo;
    const currentPage = Math.floor(offset / limit);
    const newPage = Math.max(0, currentPage - 1);
    this.props.onPageChanged(newPage);
  };

  handleRowSizeChanged = (index, value) => {
    this.props.onPageSizeChanged(value);
  };

  handleRowsSelected = rowsSelected => {
    const conversations = this.props.conversations.conversations.conversations;
    const selectedConversations = prepareSelectedRowsData(
      conversations,
      rowsSelected
    );
    this.props.onConversationSelected(rowsSelected, selectedConversations);
  };

  handleOpenConversation = index =>
    this.setState({ activeConversationIndex: index });

  handleRequestPreviousConversation = () =>
    this.setState(prevState => {
      const { activeConversationIndex: oldIndex } = prevState;
      const newIndex = oldIndex - 1;
      if (newIndex < 0) return;
      return { activeConversationIndex: newIndex };
    });

  handleRequestNextConversation = () =>
    this.setState(prevState => {
      const { activeConversationIndex: oldIndex } = prevState;
      const { conversations } = this.props.conversations.conversations;
      const newIndex = oldIndex + 1;
      if (newIndex >= conversations.length) return;
      return { activeConversationIndex: newIndex };
    });

  handleCloseConversation = () =>
    this.setState({ activeConversationIndex: -1 });

  render() {
    if (this.props.conversations.loading) {
      return <LoadingIndicator />;
    }

    const { conversations, pageInfo } = this.props.conversations.conversations;
    const { limit, offset, total } = pageInfo;
    const displayPage = Math.floor(offset / limit) + 1;
    const tableData = prepareDataTableData(conversations);

    const { activeConversationIndex } = this.state;
    const activeConversation = conversations[activeConversationIndex];
    const navigation = {
      previous: conversations[activeConversationIndex - 1] !== undefined,
      next: conversations[activeConversationIndex + 1] !== undefined
    };
    return (
      <div>
        <DataTables
          data={tableData}
          columns={this.prepareTableColumns()}
          multiSelectable
          selectable
          enableSelectAll
          showCheckboxes
          page={displayPage}
          rowSize={limit}
          count={total}
          onNextPageClick={this.handleNextPageClick}
          onPreviousPageClick={this.handlePreviousPageClick}
          onRowSizeChange={this.handleRowSizeChanged}
          onRowSelection={this.handleRowsSelected}
          rowSizeList={[10, 30, 50, 100, 500, 1000, 2000]}
          selectedRows={this.props.selectedRows}
        />
        <ConversationPreviewModal
          conversation={activeConversation}
          organizationId={this.props.organizationId}
          navigation={navigation}
          onRequestPrevious={this.handleRequestPreviousConversation}
          onRequestNext={this.handleRequestNextConversation}
          onRequestClose={this.handleCloseConversation}
        />
      </div>
    );
  }
}

IncomingMessageList.propTypes = {
  organizationId: type.string,
  cursor: type.object,
  contactsFilter: type.object,
  campaignsFilter: type.object,
  assignmentsFilter: type.object,
  tagsFilter: type.object,
  selectedRows: type.arrayOf(type.object),
  onPageChanged: type.func,
  onPageSizeChanged: type.func,
  onConversationSelected: type.func,
  onConversationCountChanged: type.func
};

const mapQueriesToProps = ({ ownProps }) => ({
  conversations: {
    query: gql`
      query Q(
        $organizationId: String!
        $cursor: OffsetLimitCursor!
        $contactsFilter: ContactsFilter
        $campaignsFilter: CampaignsFilter
        $assignmentsFilter: AssignmentsFilter
        $tagsFilter: TagsFilter
        $contactNameFilter: ContactNameFilter
      ) {
        conversations(
          cursor: $cursor
          organizationId: $organizationId
          campaignsFilter: $campaignsFilter
          contactsFilter: $contactsFilter
          assignmentsFilter: $assignmentsFilter
          tagsFilter: $tagsFilter
          contactNameFilter: $contactNameFilter
        ) {
          pageInfo {
            limit
            offset
            total
          }
          conversations {
            texter {
              id
              displayName
            }
            contact {
              id
              assignmentId
              firstName
              lastName
              cell
              messageStatus
              messages {
                id
                text
                isFromContact
                createdAt
                userId
                sendStatus
              }
              optOut {
                cell
              }
              updatedAt
            }
            campaign {
              id
              title
            }
          }
        }
      }
    `,
    variables: {
      organizationId: ownProps.organizationId,
      cursor: ownProps.cursor,
      contactsFilter: ownProps.contactsFilter,
      campaignsFilter: ownProps.campaignsFilter,
      assignmentsFilter: ownProps.assignmentsFilter,
      tagsFilter: ownProps.tagsFilter,
      contactNameFilter: ownProps.contactNameFilter
    },
    forceFetch: true
  }
});

export default loadData(withRouter(IncomingMessageList), { mapQueriesToProps });
