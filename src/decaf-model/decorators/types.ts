export type HttpVerbs = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type DecafApiProperty = {
  name: string;
  description?: string;
  required?: boolean;
  type?: any;
};

export type DecafModelRoute = {
  path: string;
  description?: string;
  apiProperties: DecafApiProperty[];
  getPK: (...args: Array<string | number>) => string;
};

export type DecafParamProps = {
  raw: Record<string, string | number>;
  keysInOrder: Array<string>;
  valuesInOrder: Array<string | number>;
};
