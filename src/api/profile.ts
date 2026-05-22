import { z } from "zod";
import { GAMMA_API } from "../config.js";
import type { Profile } from "../types.js";
import { fetchJson } from "./client.js";

const SearchProfile = z
  .object({
    proxyWallet: z.string(),
    pseudonym: z.string().nullish(),
    name: z.string().nullish(),
    bio: z.string().nullish(),
    displayUsernamePublic: z.boolean().nullish(),
  })
  .passthrough();

const SearchResponse = z
  .object({
    profiles: z.array(SearchProfile).default([]),
  })
  .passthrough();

export async function resolveUsernameToWallet(
  username: string,
): Promise<Profile> {
  const data = await fetchJson(`${GAMMA_API}/search`, SearchResponse, {
    query: {
      q: username,
      limit_per_type: 10,
      events_status: "all",
    },
  });

  const profiles = data.profiles ?? [];
  const needle = username.toLowerCase();
  const exact = profiles.find(
    (p) => (p.pseudonym ?? "").toLowerCase() === needle,
  );
  const match = exact ?? profiles[0];
  if (!match) {
    throw new Error(`No Polymarket profile found for username "${username}"`);
  }
  return {
    username,
    proxyWallet: match.proxyWallet,
    pseudonym: match.pseudonym ?? undefined,
    name: match.name ?? undefined,
    bio: match.bio ?? undefined,
  };
}
