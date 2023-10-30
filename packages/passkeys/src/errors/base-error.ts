import { Evaluate, OneOf } from "../types";

type BaseErrorOptions = Evaluate<
	OneOf<{ details?: string | undefined } | { cause: BaseError | Error }>
>;

export type BaseErrorType = BaseError & { name: "BaseError" };
export class BaseError extends Error {
	details: string;
	shortMessage: string;

	override name = "BaseError";

	constructor(shortMessage: string, options: BaseErrorOptions = {}) {
		super();

		const details =
			options.cause instanceof BaseError
				? options.cause.details
				: options.cause?.message
				? options.cause.message
				: // biome-ignore lint/style/noNonNullAssertion: <explanation>
				  options.details!;

		this.message = [
			shortMessage || "An error occurred.",
			...(details ? [`Details: ${details}`] : []),
		].join("\n");

		if (options.cause) this.cause = options.cause;
		this.details = details;
		this.shortMessage = shortMessage;
	}
}
