export type HttpVerbs = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type DecafApiProperties = {
  name: string;
  description?: string;
  required?: boolean;
  type?: any;
};

export type DecafModelRoute = {
  path: string;
  description?: string;
  apiProperties: DecafApiProperties[];
  getPK: (...args: Array<string | number>) => string;
};

export type DecafParamProps = {
  original: Record<string, any>;
  ordered: any[];
  order: string[];
};
