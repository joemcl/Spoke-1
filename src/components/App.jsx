import PropTypes from "prop-types";
import React from "react";
import MuiThemeProvider from "material-ui/styles/MuiThemeProvider";
import muiTheme from "../styles/mui-theme";
import theme from "../styles/theme";
import { StyleSheet, css } from "aphrodite";
import injectTapEventPlugin from "react-tap-event-plugin";
import Form from "react-formal";
import GSTextField from "./forms/GSTextField";
import GSDateField from "./forms/GSDateField";
import GSScriptField from "./forms/GSScriptField";
import GSScriptOptionsField from "./forms/GSScriptOptionsField";
import GSSelectField from "./forms/GSSelectField";
import GSPasswordField from "./forms/GSPasswordField";
import VersionNotifier from "../client/VersionNotifier";

// Needed for MaterialUI
injectTapEventPlugin();

Form.addInputTypes({
  string: GSTextField,
  number: GSTextField,
  date: GSDateField,
  email: GSTextField,
  script: GSScriptField,
  scriptoptions: GSScriptOptionsField,
  select: GSSelectField,
  password: GSPasswordField
});

const styles = StyleSheet.create({
  root: {
    ...theme.text.body,
    height: "100%"
  }
});

const App = ({ children }) => (
  <MuiThemeProvider muiTheme={muiTheme}>
    <div className={css(styles.root)}>
      <VersionNotifier />
      {children}
    </div>
  </MuiThemeProvider>
);

App.propTypes = {
  children: PropTypes.object
};

export default App;
