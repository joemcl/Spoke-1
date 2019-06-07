import React, { Component } from "react";
import PropTypes from "prop-types";
import gql from "graphql-tag";
import AssignmentRequestTable, { RowWorkState } from "./AssignmentRequestTable";
import loadData from "../hoc/load-data";
import wrapMutations from "../hoc/wrap-mutations";
import CircularProgress from "material-ui/CircularProgress";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const dummyData = [
  {
    id: "1",
    user: {
      id: "1",
      firstName: "Ben",
      lastName: "Chrobot"
    },
    amount: 100,
    state: RowWorkState.Inactive
  },
  {
    id: "2",
    user: {
      id: "2",
      firstName: "Ben",
      lastName: "Packer"
    },
    amount: 100,
    state: RowWorkState.Inactive
  }
];

class AdminAssignmentRequest extends Component {
  timers = [];

  state = {
    assignmentRequests: []
  };

  componentDidMount() {
    this.setState({ assignmentRequests: dummyData });
  }

  componentWillUnmount() {
    this.timers.forEach(timer => clearTimeout(timer));
  }

  setRequestState = (requestId, state) => {
    const { assignmentRequests } = this.state;
    const requestIndex = assignmentRequests.findIndex(
      request => request.id === requestId
    );
    if (requestIndex < 0)
      throw new Error(`Could not find request with ID ${requestId}`);
    assignmentRequests[requestIndex].state = state;
    this.setState({ assignmentRequests });
  };

  deleteRequest = requestId => {
    let { assignmentRequests } = this.state;
    assignmentRequests = assignmentRequests.filter(
      request => request.id !== requestId
    );
    this.setState({ assignmentRequests });
  };

  handleApproveRequest = async requestId => {
    console.log("Approve", requestId);
    this.setRequestState(requestId, RowWorkState.Working);
    try {
      // simulate network request
      await sleep(1000);
      console.log("Approved request");
      this.setRequestState(requestId, RowWorkState.Approved);
      await sleep(2000);
      this.deleteRequest(requestId);
    } catch (exc) {
      console.log("Request approval failed", exc);
      this.setRequestState(requestId, RowWorkState.Error);
    }
  };

  handleDenyRequest = async requestId => {
    console.log("Deny", requestId);
    this.setRequestState(requestId, RowWorkState.Working);
    try {
      // simulate network request
      await sleep(1000);
      console.log("Denied request");
      this.setRequestState(requestId, RowWorkState.Denied);
      await sleep(4000);
      this.deleteRequest(requestId);
    } catch (exc) {
      console.log("Request deny failed", exc);
      this.setRequestState(requestId, RowWorkState.Error);
    }
  };

  render() {
    const { pendingAssignmentRequests } = this.props;

    if (pendingAssignmentRequests.loading) {
      return <CircularProgress />;
    }

    const { assignmentRequests } = pendingAssignmentRequests;

    return (
      <AssignmentRequestTable
        assignmentRequests={assignmentRequests}
        onApproveRequest={this.handleApproveRequest}
        onDenyRequest={this.handleDenyRequest}
      />
    );
  }
}

AdminAssignmentRequest.propTypes = {
  params: PropTypes.object.isRequired
};

const mapQueriesToProps = ({ ownProps }) => ({
  pendingAssignmentRequests: {
    query: gql`
      query assignmentRequests($organizationId: String!, $status: String) {
        assignmentRequests(organizationId: $organizationId, status: $status) {
          id
          createdAt
          user {
            id
            firstName
            lastName
          }
        }
      }
    `,
    variables: {
      organizationId: ownProps.params.organizationId,
      status: "pending"
    },
    forceFetch: true
  }
});

const mapMutationsToProps = ({ ownProps }) => ({
  approveAssignmentRequest: assignmentRequestId => ({
    mutation: gql`
      mutation approveAssignmentRequest($assignmentRequestId: String!) {
        approveAssignmentRequest(assignmentRequestId: $assignmentRequestId)
      }
    `,
    variables: { assignmentRequestId }
  }),
  rejectAssignmentRequest: assignmentRequestId => ({
    mutation: gql`
      mutation rejectAssignmentRequest($assignmentRequestId: String!) {
        rejectAssignmentRequest(assignmentRequestId: $assignmentRequestId)
      }
    `,
    variables: { assignmentRequestId }
  })
});

export default loadData(wrapMutations(AdminAssignmentRequest), {
  mapQueriesToProps,
  mapMutationsToProps
});
