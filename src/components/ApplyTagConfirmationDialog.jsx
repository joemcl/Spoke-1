import React, { Component } from "react";
import PropTypes from "prop-types";

import ReactMarkdown from "react-markdown";
import Dialog from "material-ui/Dialog";
import FlatButton from "material-ui/FlatButton";

class ApplyTagConfirmationDialog extends Component {
  state = {
    confirmStepIndex: 0
  };

  componentWillReceiveProps(nextProps) {
    const { pendingTag: lastTag } = this.props;
    const { pendingTag: nextTag } = nextProps;
    const isNewTag = lastTag === undefined && nextTag !== undefined;
    const isDifferentTag = lastTag && nextTag && lastTag.id !== nextTag.id;
    if (isNewTag || isDifferentTag) {
      this.state.confirmStepIndex = 0;
    }
  }

  handleRequestClose = () => this.props.onCancel();

  handleConfirmStep = () => {
    const { confirmStepIndex } = this.state;
    const { pendingTag } = this.props;
    const { confirmationSteps } = pendingTag;

    if (confirmStepIndex < confirmationSteps.length - 1) {
      return this.setState({ confirmStepIndex: confirmStepIndex + 1 });
    }

    this.props.onConfirm(pendingTag);
  };

  render() {
    const { pendingTag } = this.props;
    let { confirmStepIndex } = this.state;

    const { confirmationSteps = [["", "null", "null"]] } = pendingTag || {};
    confirmStepIndex = Math.min(confirmStepIndex, confirmationSteps.length - 1);
    const [content, confirm, cancel] = confirmationSteps[confirmStepIndex];
    const confrimTagActions = [
      <FlatButton label={confirm} primary onClick={this.handleConfirmStep} />,
      <FlatButton label={cancel} primary onClick={this.handleRequestClose} />
    ];

    return (
      <Dialog
        title={"Confirm Add Tag"}
        open={pendingTag !== undefined}
        actions={confrimTagActions}
        onRequestClose={this.handleRequestClose}
      >
        <ReactMarkdown source={content} />
      </Dialog>
    );
  }
}

ApplyTagConfirmationDialog.defaultProps = {};

ApplyTagConfirmationDialog.propTypes = {
  pendingTag: PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    confirmationSteps: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.string))
      .isRequired
  }),
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired
};

export default ApplyTagConfirmationDialog;
