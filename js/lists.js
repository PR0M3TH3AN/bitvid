// js/lists.js

// Admin-level (platform) moderation seeds. NOT user-level blocks.
const ADMIN_SEED_NPUBS = [
  "npub13yarr7j6vjqjjkahd63dmr27curypehx45ucue286ac7sft27y0srnpmpe", // bitvid
  "npub15jnttpymeytm80hatjqcvhhqhzrhx6gxp8pq0wn93rhnu8s9h9dsha32lx", // thePR0M3TH3AN
  "npub1j37gc05qpqzyrmdc5vetsc9h5qtstas7tr25j0n9sdpqxghz6m4q2ej6n8", // Ghost Grid Network
  "npub1epvnvv3kskvpnmpqgnm2atevsmdferhp7dg2s0yc7uc0hdmqmgssx09tu2", // Chain Reaction
  "npub1qny3tkh0acurzla8x3zy4nhrjz5zd8l9sy9jys09umwng00manysew95gx", // ODELL
  "npub1qxduthz4p8v5zsux524df569pt7lj0d36dyqadnta2val64dtnhsr50h64", // NosToons
  "npub19ma2w9dmk3kat0nt0k5dwuqzvmg3va9ezwup0zkakhpwv0vcwvcsg8axkl", // vinney
  "npub1rcr8h76csgzhdhea4a7tq5w5gydcpg9clgf0cffu6z45rnc6yp5sj7cfuz", // djmeistro
  "npub1m5s9w4t03znyetxswhgq0ud7fq8ef8y3l4kscn2e8wkvmv42hh3qujgjl3", // mister_monster
  "npub13qexjtmajssuhz8gdchgx65dwsnr705drse294zz5vt4e78ya2vqzyg8lv", // SatoshiSignal
  "npub1da7m2ksdj24995hm8afv88pjpvzt6t9vh70mg8t52yjwtxza3vjszyar58", // GoblinBox
  "npub196rl3tls3c4y79pc3ptrrj2430z7p5uwetfhukhtkt69hph0fvwq08l43q", // ~Bordut-Nodlex
];

export const ADMIN_INITIAL_WHITELIST = ADMIN_SEED_NPUBS;
export const ADMIN_INITIAL_BLACKLIST = [""];
export const ADMIN_INITIAL_EVENT_BLACKLIST = [""];

// Back-compat (will be removed after migration):
export const initialWhitelist = ADMIN_INITIAL_WHITELIST;
export const initialBlacklist = ADMIN_INITIAL_BLACKLIST;
export const initialEventBlacklist = ADMIN_INITIAL_EVENT_BLACKLIST;
