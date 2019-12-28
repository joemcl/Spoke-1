import isEmpty from "lodash/isEmpty";

// Used to generate data-test attributes on non-production environments and used by end-to-end tests
export const dataTest = (value, disable) => {
  const attribute =
    window.NODE_ENV !== "production" && !disable ? { "data-test": value } : {};
  return attribute;
};

export const camelCase = str => {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (letter, index) => {
      return index == 0 ? letter.toLowerCase() : letter.toUpperCase();
    })
    .replace(/\s+/g, "");
};

export const nameComponents = name => {
  let firstName = undefined;
  let lastName = undefined;

  if (isEmpty(name)) return { firstName, lastName };

  const splitName = name.split(" ");
  if (splitName.length == 1) {
    firstName = splitName[0];
    lastName = "";
  } else if (splitName.length == 2) {
    firstName = splitName[0];
    lastName = splitName[1];
  } else {
    firstName = splitName[0];
    lastName = splitName.slice(1, splitName.length + 1).join(" ");
  }

  return { firstName, lastName };
};
