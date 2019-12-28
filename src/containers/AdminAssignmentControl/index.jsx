import React, { Component } from "react";
import PropTypes from "prop-types";
import gql from "graphql-tag";

import { Card, CardText, CardActions, CardHeader } from "material-ui/Card";
import Dialog from "material-ui/Dialog";
import RaisedButton from "material-ui/RaisedButton";
import FlatButton from "material-ui/FlatButton";

import loadData from "../../containers/hoc/load-data";
import AssignmentRow from "./AssignmentRow";

class AdminAssignmentControl extends Component {
  state = {
    changes: {},
    working: false,
    error: undefined
  };

  assignmentPoolsWithChanges = () => {
    const { changes } = this.state;
    let assignmentPools = this.assignmentPoolsFromProps();
    assignmentPools = assignmentPools.map(pool => {
      const poolChanges = changes[pool.id] || {};
      return Object.assign(pool, poolChanges);
    });
    return assignmentPools;
  };

  assignmentPoolsFromProps = () => {
    const {
      textRequestFormEnabled,
      textRequestType,
      textRequestMaxCount,
      teams
    } = this.props.assignmentConfiguration.organization;
    const generalAssignment = {
      id: "general",
      title: "General",
      textColor: "",
      backgroundColor: "",
      isAssignmentEnabled: textRequestFormEnabled,
      assignmentType: textRequestType,
      maxRequestCount: textRequestMaxCount,
      escalationTags: []
    };

    const assignmentPools = [generalAssignment].concat(teams);
    return assignmentPools;
  };

  createHandleChangeAssignment = poolId => payload => {
    const { changes } = this.state;
    const poolChanges = this.state.changes[poolId] || {};
    changes[poolId] = Object.assign(poolChanges, payload);
    this.setState({ changes });
  };

  handleSaveAssignmentControls = async () => {
    const { changes } = this.state;
    const payloads = Object.keys(changes).map(key => {
      const teamPayload = Object.assign({}, changes[key], { id: key });

      if (teamPayload.escalationTags) {
        teamPayload.escalationTagIds = teamPayload.escalationTags.map(
          t => t.id
        );
        delete teamPayload.escalationTags;
      }

      return teamPayload;
    });

    this.setState({ working: true });
    try {
      const response = await this.props.mutations.saveTeams(payloads);
      if (response.errors) throw response.errors;
      this.setState({ changes: {} });
    } catch (err) {
      this.setState({ error: err.message });
    } finally {
      this.setState({ working: false });
    }
  };

  handleCloseDialog = () => this.setState({ error: undefined });

  render() {
    const { className, containerStyle, style } = this.props;
    const { changes, working, error } = this.state;
    const hasChanges = Object.keys(changes).length > 0;

    const assignmentPools = this.assignmentPoolsWithChanges();
    const escalationTagList = this.props.assignmentConfiguration.organization
      ? this.props.assignmentConfiguration.organization.escalationTagList
      : [];

    const dialogActions = [
      <FlatButton
        label="Close"
        primary={true}
        onClick={this.handleCloseDialog}
      />
    ];

    return (
      <Card className={className} containerStyle={containerStyle} style={style}>
        <CardHeader title="Assignment Request Controls" />
        <CardText>
          {assignmentPools.map(assignmentPool => (
            <AssignmentRow
              key={assignmentPool.id}
              assignmentPool={assignmentPool}
              escalationTagList={escalationTagList}
              isRowDisabled={working}
              onChange={this.createHandleChangeAssignment(assignmentPool.id)}
            />
          ))}
        </CardText>
        <CardActions style={{ textAlign: "right" }}>
          <RaisedButton
            label="Save"
            primary
            disabled={working || !hasChanges}
            onClick={this.handleSaveAssignmentControls}
          />
        </CardActions>
        <Dialog
          title={"Error saving Assignment Controls"}
          actions={dialogActions}
          modal={false}
          open={!!error}
          onRequestClose={this.handleCloseDialog}
        >
          {error}
        </Dialog>
      </Card>
    );
  }
}

const mapQueriesToProps = ({ ownProps }) => ({
  assignmentConfiguration: {
    query: gql`
      query getAssignmentConfiguration($organizationId: String!) {
        organization(id: $organizationId) {
          id
          textRequestFormEnabled
          textRequestType
          textRequestMaxCount
          escalationTagList {
            id
            title
          }
          teams {
            id
            title
            textColor
            backgroundColor
            isAssignmentEnabled
            assignmentType
            maxRequestCount
            escalationTags {
              id
              title
            }
          }
        }
      }
    `,
    variables: {
      organizationId: ownProps.params.organizationId
    }
  }
});

const mapMutationsToProps = ({ ownProps }) => ({
  saveTeams: teams => ({
    mutation: gql`
      mutation saveTeams($organizationId: String!, $teams: [TeamInput]!) {
        saveTeams(organizationId: $organizationId, teams: $teams) {
          id
          title
          textColor
          backgroundColor
          isAssignmentEnabled
          assignmentType
          maxRequestCount
          escalationTags {
            id
            title
          }
        }
      }
    `,
    variables: {
      organizationId: ownProps.params.organizationId,
      teams
    },
    refetchQueries: ["getAssignmentConfiguration"]
  })
});

AdminAssignmentControl.defaultProps = {
  className: "",
  containerStyle: {},
  style: {}
};

AdminAssignmentControl.propTypes = {
  params: PropTypes.object.isRequired,
  assignmentConfiguration: PropTypes.object.isRequired,
  className: PropTypes.string,
  containerStyle: PropTypes.object,
  style: PropTypes.object
};

export default loadData(AdminAssignmentControl, {
  mapMutationsToProps,
  mapQueriesToProps
});
