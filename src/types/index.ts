// ! taken from @wagmi/core
/** Combines members of an intersection into a readable type. */
// https://twitter.com/mattpocockuk/status/1622730173446557697?s=20&t=NdpAcmEFXY01xkqU3KO0Mg
export type Evaluate<type> = { [key in keyof type]: type[key] } & unknown;

/** Makes objects destructurable. */
export type OneOf<
	union extends object,
	///
	keys extends KeyofUnion<union> = KeyofUnion<union>,
> = union extends infer Item
	? Evaluate<Item & { [K in Exclude<keys, keyof Item>]?: undefined }>
	: never;
type KeyofUnion<type> = type extends type ? keyof type : never;
