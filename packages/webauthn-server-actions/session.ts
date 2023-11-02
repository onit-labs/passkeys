import { IronSessionOptions, IronSessionData, getServerActionIronSession } from "iron-session";

import { cookies } from "next/headers";

const sessionOptions: IronSessionOptions = {
	password: "change-this-this-is-not-a-secure-password",
	cookieName: "cookieNameInBrowser",
	cookieOptions: { secure: process.env.NODE_ENV === "production" },
};

declare module "iron-session" {
	interface IronSessionData {
		cookieVariable?: string;
	}
}

// TODO: figure out a good way for the user to pass their own options
const getSession = async (options: IronSessionOptions = sessionOptions) => {
	const session = getServerActionIronSession<IronSessionData>(options, cookies());
	return session;
};

export { getSession };
