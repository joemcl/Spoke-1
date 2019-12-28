import { sqlResolvers } from "./lib/utils";

export const resolvers = {
  CannedResponse: {
    ...sqlResolvers(["id", "title", "text"]),
    isUserCreated: cannedResponse => cannedResponse.user_id !== ""
  }
};
