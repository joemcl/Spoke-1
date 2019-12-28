import PropTypes from "prop-types";
import React from "react";
import moment from "moment-timezone";

import { Toolbar, ToolbarGroup, ToolbarTitle } from "material-ui/Toolbar";
import { grey100 } from "material-ui/styles/colors";

const inlineStyles = {
  toolbar: {
    backgroundColor: grey100
  },
  locationToolbarTitle: {
    fontSize: "1em"
  },
  timeToolbarTitle: {
    fontSize: "1em"
  }
};

const ContactToolbar = function ContactToolbar(props) {
  const { campaign, campaignContact, rightToolbarIcon } = props;
  const {
    location: { city, state },
    timezone: contactTimezone,
    firstName
  } = campaignContact;

  const timezone = contactTimezone || campaign.timezone;
  const localTime = moment()
    .tz(timezone)
    .format("LT"); // format('h:mm a')

  const location = [city, state]
    .filter(item => !!item)
    .join(", ")
    .trim();

  const contactDetailText = (
    <span>
      {firstName} &nbsp;&nbsp; {location} {localTime}
    </span>
  );

  return (
    <Toolbar style={inlineStyles.toolbar}>
      <ToolbarGroup>
        {rightToolbarIcon}
        <ToolbarTitle text={campaign.title} />
        <ToolbarTitle
          text={contactDetailText}
          style={inlineStyles.timeToolbarTitle}
        />
      </ToolbarGroup>
    </Toolbar>
  );
};

ContactToolbar.propTypes = {
  campaignContact: PropTypes.object, // contacts for current assignment
  rightToolbarIcon: PropTypes.element,
  campaign: PropTypes.object
};

export default ContactToolbar;
