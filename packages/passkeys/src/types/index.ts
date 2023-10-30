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

// ! borrowed from https://github.com/sindresorhus/type-fest/blob/b9723d4785f01f8d2487c09ee5871a1f615781aa/source/is-equal.d.ts
export type IsEqual<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
	? true
	: false;

// ! borrowed from https://github.com/sindresorhus/type-fest/blob/b9723d4785f01f8d2487c09ee5871a1f615781aa/source/except.d.ts
type Filter<KeyType, ExcludeType> = IsEqual<KeyType, ExcludeType> extends true
	? never
	: KeyType extends ExcludeType
	? never
	: KeyType;

type ExceptOptions = {
	/**
	Disallow assigning non-specified properties.

	Note that any omitted properties in the resulting type will be present in autocomplete as `undefined`.

	@default false
	*/
	requireExactProps?: boolean;
};

export type Except<
	ObjectType,
	KeysType extends keyof ObjectType,
	Options extends ExceptOptions = { requireExactProps: false },
> = {
	[KeyType in keyof ObjectType as Filter<KeyType, KeysType>]: ObjectType[KeyType];
	// biome-ignore lint/complexity/noBannedTypes: <explanation>
} & (Options["requireExactProps"] extends true ? Partial<Record<KeysType, never>> : {});

// ! adapted from https://github.com/sindresorhus/type-fest/blob/b9723d4785f01f8d2487c09ee5871a1f615781aa/source/set-required.d.ts
export type SetRequired<
	BaseType,
	Keys extends keyof BaseType,
> = // type](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-8.html#distributive-conditional-types). // union into a [distributive conditional // `extends unknown` is always going to be the case and is used to convert any
BaseType extends unknown
	? Evaluate<
			// Pick just the keys that are optional from the base type.
			Except<BaseType, Keys> &
				// Pick the keys that should be required from the base type and make them required.
				Required<Pick<BaseType, Keys>>
	  >
	: never;
