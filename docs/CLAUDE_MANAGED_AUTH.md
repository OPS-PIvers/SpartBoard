# Claude sign-in without Connect (Enterprise Managed Auth)

With this on, staff in a Claude Team or Enterprise organization use the SpartBoard connector without clicking **Connect**. Claude sends SpartBoard a signed identity assertion for the signed-in person, and SpartBoard swaps it for an access token.

SpartBoard accepts **Claude-issued** assertions only. Identity-provider-issued ones (Okta Cross App Access) aren't supported: SpartBoard signs staff in with Google, and Google doesn't issue these assertions.

Anthropic's developer reference: [Enterprise Managed Auth for connectors](https://claude.com/docs/connectors/building/enterprise-managed-auth).

## Set it up

You need to be an **Owner** or **Primary Owner** of the Claude organization and a **SpartBoard admin** (super admin). Domain and building admins can't see or change the Issuer URL: whoever controls it can sign in as any staff member of the organization.

1. **SpartBoard switches (once per project).** Admin Settings > Access > Previews > District switches: turn on **Claude connects without registering**, then **Claude sign-in without Connect**. Both ship off.
2. **Claude.** Add SpartBoard as a custom connector at `https://spartboard.web.app/mcp` (or `https://spartboard-dev.web.app/mcp` for dev). Open the connector, find **Managed authorization** under **Authentication**, click **Set up** and choose **Claude-issued**. Copy the **Issuer URL** it shows.
3. **SpartBoard (super admin).** Admin Settings > Organization > Overview > **Claude sign-in**: paste the Issuer URL, turn the switch on and click **Save**.
4. **Tenant ID (recommended).** Enter this organization's **Tenant ID** (shown on the same card) in **Tenant ID (optional)** in Claude's setup. Issuer URLs aren't secret: without a Tenant ID, sign-in stops working if the same Issuer URL is also saved, switched on, for another SpartBoard organization. With it, Claude names this organization in every sign-in and that can't happen.
5. **Test.** In Claude's setup, click **Run test** under **Connection status**.

To turn it off for an organization, a super admin turns off the switch on the card and saves. To turn it off everywhere, turn off **Claude sign-in without Connect** under Previews > District switches.

## Who gets signed in

A person is signed in only when all of these are true:

- They are a current member of the Claude organization whose Issuer URL you saved.
- Their Claude email is on a **verified** sign-in domain of this SpartBoard organization (Organization > Sign-in domains).
- They have signed in to SpartBoard with Google at least once, with that same address.
- They hold an active, non-student member record in the organization, and the Claude connector is on for them. Students share the district domain, so that member record is what keeps them out.

Anyone else still gets the usual **Connect** step.

## What to know

- **Removing someone.** When a person leaves the Claude organization, Claude stops signing assertions for them. The access token they already have works for up to one hour.
- **Disconnect.** **Connected apps > Disconnect** in SpartBoard ends the current token for good: the next sign-in gets a new connection, never the old one back. While managed sign-in is on, Claude connects that person again the next time they use the connector. To stop it for one person, remove them from the Claude organization or the connector.
- **One sign-in per person.** Each person gets one connection per Issuer URL. It's refreshed each hour and shows in their **Connected apps** like any other connection.

## How the server checks an assertion

`functions/src/mcp/managedAuth.ts`, in this order. Any failure returns `invalid_grant`.

1. **Organization.** If the assertion has `aud_tenant`, use the organization with that ID. Otherwise use the only switched-on organization whose saved issuer equals `iss`; none, or more than one, is refused. Switched-off copies are ignored, so another org can't block yours by saving your Issuer URL switched off. The saved issuer must equal `iss` exactly. No keys are fetched before this passes.
2. **Keys.** Fetch `<iss>/.well-known/openid-configuration` and check that its `issuer` equals `iss`. Use only the keys at its `jwks_uri`.
3. **Signature.** ES256 or RS256 only.
4. **Type.** `typ` is `oauth-id-jag+jwt`.
5. **Audience.** `aud` is exactly the string `https://spartboard.web.app`, our authorization server's `issuer`. An array with any other audience is refused; a one-item array holding only that value is accepted.
6. **Client.** The `client_id` claim equals the request's `client_id`, and that client is one we recognize.
7. **Subject.** `sub` is present. It isn't used for lookup.
8. **Time.** Checked with 60 seconds of clock skew: `exp` hasn't passed, `iat` isn't in the future, and `nbf` (if present) has passed.
9. **Replay.** Each `jti` is accepted once per issuer and remembered until `exp` plus the skew allowance (`mcp_oauth_jti`, TTL on `expireAt`).

The person is then found by `email`, as described in [Who gets signed in](#who-gets-signed-in). No refresh token is issued.
