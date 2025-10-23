import {Model} from "@decaf-ts/decorator-validation";
import {InternalError} from "@decaf-ts/db-decorators";
import {Repository} from "@decaf-ts/core";

export function repoForModel(model: string) {
	const m = Model.get(model);
	if (!m)
		throw new InternalError(`Failed to find repository for ${model}`)
	const repo = Repository.forModel(m);
	return repo;
}