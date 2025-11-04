export type HttpVerbs = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiParam = {
  name: string;
  description?: string;
  required?: boolean;
  type?: any;
};

export type DecafParamProps = {
  original: Record<string, any>;
  ordered: any[];
  order: string[];
};
