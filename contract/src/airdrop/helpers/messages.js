/**
 * @file messages.js
 * @description contains variables for all string values used within codebase for the sake of limiting.
 */

const CONSTANTS = {
  AIRDROP_ADMIN_MESSAGES: {
    DEPOSIT_TOKENS_ERROR: `Payment has failed liveliness check. This is either because it has been used already, or it is from the wrong issuer. Please check these details and try again`,
    ADD_ACCOUNTS_SUCCESS: list =>
      `Successfully added ${list.length} eligible accounts.`,
  },
  CLAIM_MESSAGES: {
    createClaimSuccessMsg: ({ value }) =>
      `Successfully claimed ${value}n tokens.`,
    OFFER_DESCRIPTION: 'claim airdrop invitation',
    INELIGIBLE_ACCOUNT_ERROR:
      'Claim failed. Signature does not correspond to an address on Airdrop allowlist.',
  },
};

const { AIRDROP_ADMIN_MESSAGES, CLAIM_MESSAGES } = CONSTANTS;

const { createClaimSuccessMsg } = CLAIM_MESSAGES;
export { AIRDROP_ADMIN_MESSAGES, CLAIM_MESSAGES, createClaimSuccessMsg };

export default CONSTANTS;
