import PropTypes from "prop-types";
import React from "react";
import gql from "graphql-tag";
import { withRouter } from "react-router";
import loadData from "./hoc/load-data";

class DashboardLoader extends React.Component {
  componentWillMount() {
    if (this.props.data.currentUser.organizations.length > 0) {
      this.props.router.push(
        `${this.props.path}/${this.props.data.currentUser.organizations[0].id}`
      );
    } else {
      this.props.router.push("/");
    }
  }

  render() {
    return <div />;
  }
}

DashboardLoader.propTypes = {
  data: PropTypes.object,
  router: PropTypes.object,
  path: PropTypes.string
};

const mapQueriesToProps = () => ({
  data: {
    query: gql`
      query getCurrentUserForLoader {
        currentUser {
          id
          organizations {
            id
          }
        }
      }
    `,
    forceFetch: true
  }
});

export default loadData(withRouter(DashboardLoader), { mapQueriesToProps });
