export type PublicIPTVList = {
  id: string;
  name: string;
  type: "m3u" | "xtream";
  configured: {
    url: boolean;
    username: boolean;
    password: boolean;
    epgUrl: boolean;
  };
};
export type IPTVListUpdate = Pick<PublicIPTVList, "id" | "name" | "type"> & {
  url?: string;
  username?: string;
  password?: string;
  epgUrl?: string;
  configured?: PublicIPTVList["configured"];
};
