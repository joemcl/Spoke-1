import nexmo from "./nexmo";
import twilio from "./twilio";
import fakeservice from "./fakeservice";
import assembleNumers from "./assemble-numbers";

// Each service needs the following api points:
// async sendMessage(message, trx) -> void
// To receive messages from the outside, you will probably need to implement these, as well:
// async handleIncomingMessage(<native message format>) -> saved (new) messagePart.id
// async convertMessagePartsToMessage(messagePartsGroupedByMessage) -> new Message() <unsaved>

const serviceMap = {
  "assemble-numbers": assembleNumers,
  nexmo,
  twilio,
  fakeservice
};

export default serviceMap;
