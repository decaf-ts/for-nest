import { Model } from "@decaf-ts/decorator-validation";
import { InternalError } from "@decaf-ts/db-decorators";
import { Repo, Repository } from "@decaf-ts/core";
import { Constructor } from "@decaf-ts/decoration";
import { Injectable } from "@nestjs/common";

@Injectable()
export class RepoFactory {
  for<M extends Model>(model: string | Constructor<M>): Repo<M> {
    model = typeof model === "string" ? (Model.get(model) as any) : model;
    if (!model) {
      throw new InternalError(`Failed to find repository for ${model}`);
    }
    return Repository.forModel(model as Constructor<M>);
  }
}
