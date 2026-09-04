/**
 * The one org `firestore.rules` can reach by fixed path — see isMemberSuperAdmin()
 * and operatorMember() there. Rules cannot enumerate orgs, so a `super_admin`
 * member doc in any other org grants nothing server-side; client gates that mirror
 * those rules must compare against this id rather than trusting roleId alone.
 */
export const OPERATOR_ORG_ID = 'orono';
