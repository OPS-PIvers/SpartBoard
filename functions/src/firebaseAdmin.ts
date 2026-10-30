// firebase-admin v14 dropped the `admin.firestore()` namespace; this rebuilds the slice we use from the modular entry points.
import * as appModule from 'firebase-admin/app';
import * as authModule from 'firebase-admin/auth';
import * as firestoreModule from 'firebase-admin/firestore';
import * as storageModule from 'firebase-admin/storage';

export const initializeApp = appModule.initializeApp;

export const apps = {
  get length(): number {
    return appModule.getApps().length;
  },
};

export function firestore(): firestoreModule.Firestore {
  return firestoreModule.getFirestore();
}

// eslint-disable-next-line @typescript-eslint/no-namespace -- keeps the v13 `admin.firestore.X` call sites and types working.
export namespace firestore {
  export import CollectionReference = firestoreModule.CollectionReference;
  export type DocumentData = firestoreModule.DocumentData;
  export import DocumentReference = firestoreModule.DocumentReference;
  export import DocumentSnapshot = firestoreModule.DocumentSnapshot;
  export import FieldPath = firestoreModule.FieldPath;
  export import FieldValue = firestoreModule.FieldValue;
  export import Firestore = firestoreModule.Firestore;
  export import GeoPoint = firestoreModule.GeoPoint;
  export import Query = firestoreModule.Query;
  export import QueryDocumentSnapshot = firestoreModule.QueryDocumentSnapshot;
  export import Timestamp = firestoreModule.Timestamp;
  export import Transaction = firestoreModule.Transaction;
  export import WriteBatch = firestoreModule.WriteBatch;
}

export function auth(): authModule.Auth {
  return authModule.getAuth();
}

// eslint-disable-next-line @typescript-eslint/no-namespace -- keeps the v13 `admin.auth.X` types working.
export namespace auth {
  export import Auth = authModule.Auth;
  export type GetUsersResult = authModule.GetUsersResult;
  export type UserIdentifier = authModule.UserIdentifier;
  export import UserMetadata = authModule.UserMetadata;
  export import UserRecord = authModule.UserRecord;
}

export function storage(): storageModule.Storage {
  return storageModule.getStorage();
}
