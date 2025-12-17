import { Model, ModelConstructor } from "@decaf-ts/decorator-validation";
import request from "supertest";
import { Logger } from "@nestjs/common";

export interface HttpModelResponse<T> {
  pk: string;
  status: number;
  raw: any;
  data: T;
  toEqual(expected: any): void;
  toJSON(): T;
}

export class HttpModelClient<T extends Model> extends Logger {
  private readonly path: string;
  private readonly server: request.SuperTest<request.Test>;

  constructor(
    private readonly app: any,
    private readonly Constr: ModelConstructor<T>
  ) {
    super();
    this.server = request(app);
    this.path = `/${Constr.name.toLowerCase()}`;
  }

  private wrapResponse(body: any, status: number): HttpModelResponse<T> {
    const self = this as any;
    if (status > 400) this.error(body?.error);

    return {
      status,
      raw: body,
      data: new this.Constr(body),
      get pk() {
        return this.data[Model.pk(self.Constr)] as string;
      },
      toEqual(expected: any) {
        expect(this.data).toEqual(expected);
      },
      toJSON() {
        return this.data;
      },
    };
  }

  async post(body: Record<string, any>) {
    const res = await this.server.post(this.path).send(body);
    return this.wrapResponse(res.body, res.status);
  }

  async get(...routeParams: string[]) {
    const res = await this.server.get(
      `${this.path}/${routeParams.join("/")}`.replace("/?", "?")
    );
    return this.wrapResponse(res.body, res.status);
  }

  async put(body: Record<string, any>, ...routeParams: string[]) {
    const res = await this.server
      .put(`${this.path}/${routeParams.join("/")}`)
      .send(body);
    return this.wrapResponse(res.body, res.status);
  }

  async delete(...routeParams: string[]) {
    const res = await this.server.delete(
      `${this.path}/${routeParams.join("/")}`
    );
    return this.wrapResponse(res.body, res.status);
  }
}
