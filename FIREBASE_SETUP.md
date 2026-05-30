# Firebase Configuration Guide

This document provides step-by-step instructions to set up Firebase for the Nakshatra Stock Management System.

## Prerequisites

1. Google account
2. Firebase CLI installed: `npm install -g firebase-tools`
3. Node.js and npm installed

## Step 1: Create a Firebase Project

1. Visit [Firebase Console](https://console.firebase.google.com)
2. Click "Create project"
3. Enter project name: "Nakshatra Stock Management"
4. Disable Google Analytics (optional)
5. Click "Create project"

## Step 2: Enable Authentication

1. In Firebase Console, go to **Authentication**
2. Click **Get Started**
3. Select **Email/Password** sign-in method
4. Enable it
5. Click **Save**

Create demo users:
- Email: `admin@nakshatra.com` → Set password: `Demo@123`
- Email: `operator@nakshatra.com` → Set password: `Demo@123`

## Step 3: Create Firestore Database

1. In Firebase Console, go to **Firestore Database**
2. Click **Create database**
3. Select **Start in test mode** (for development)
4. Choose region (e.g., asia-south1 for India)
5. Click **Create**

## Step 4: Create Collections

Create the following collections in Firestore:

### Collection: users
Create test documents:
```json
{
  "id": "user1",
  "email": "admin@nakshatra.com",
  "name": "Admin User",
  "role": "admin",
  "createdAt": "2024-01-01T00:00:00Z",
  "isActive": true
}
```

### Collection: raw_materials
```json
{
  "id": "mat1",
  "name": "250ML Preform",
  "category": "Preforms",
  "unit": "kg",
  "currentStock": 500,
  "minimumStockLevel": 100,
  "isActive": true,
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### Collection: products
```json
{
  "id": "prod1",
  "name": "LAVIN 250ML",
  "brand": "Lavin",
  "bottleSize": "250ML",
  "status": "active",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### Collection: production_entries
(Empty initially, populated by application)

### Collection: material_usage
(Empty initially, populated by application)

### Collection: stock_transactions
(Empty initially, for audit purposes)

## Step 5: Configure Firebase Credentials

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Click **Service accounts** tab
3. Click **Generate new private key** to download JSON
4. Keep this file secure!

For web app:
1. Click **</>** icon to add a web app
2. Enter app name: "Nakshatra"
3. Copy the Firebase config object
4. Create a `.env.local` file in the project root with these values:

```bash
VITE_FIREBASE_API_KEY=YOUR_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT_ID.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=YOUR_PROJECT_ID.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID=YOUR_APP_ID
```

5. Restart the development server after saving `.env.local`

## Step 6: Update Firestore Security Rules

In Firebase Console, go to **Firestore** → **Rules**, replace all content with:

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow users to read/write their own documents
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
      allow read: if request.auth != null && exists(/databases/$(database)/documents/users/$(request.auth.uid)) && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Raw Materials: Admin can write, all authenticated users can read
    match /raw_materials/{document=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && exists(/databases/$(database)/documents/users/$(request.auth.uid)) && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Products: Admin can write, all authenticated users can read
    match /products/{document=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && exists(/databases/$(database)/documents/users/$(request.auth.uid)) && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Production Entries: Admin and Operators can write, all can read
    match /production_entries/{document=**} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && exists(/databases/$(database)/documents/users/$(request.auth.uid)) && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'operator'];
      allow update, delete: if request.auth != null && (resource.data.createdBy == request.auth.uid || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin');
    }
    
    // Material Usage: Admin and Operators can write, all can read
    match /material_usage/{document=**} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && exists(/databases/$(database)/documents/users/$(request.auth.uid)) && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'operator'];
      allow update, delete: if request.auth != null && (resource.data.createdBy == request.auth.uid || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin');
    }
    
    // Stock Transactions (audit log)
    match /stock_transactions/{document=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && exists(/databases/$(database)/documents/users/$(request.auth.uid)) && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
```

Click **Publish** to apply the rules.

## Step 7: Set Up Firebase Hosting (Optional)

```bash
firebase init hosting
firebase deploy
```

## Step 8: Test the Setup

1. Start the development server: `npm run dev`
2. Navigate to `http://localhost:5173`
3. Login with demo credentials
4. Test creating a raw material
5. Test creating a product
6. Test production entry

## Troubleshooting

### "Permission denied" error
- Check Firestore Security Rules
- Ensure user has correct role in Firestore
- Clear browser cache and re-login

### "User not found" error
- Create the user in Firebase Authentication
- Create corresponding user document in Firestore users collection
- Ensure user has the correct role

### "Quota exceeded" error
- Free tier has limits on database operations
- Consider upgrading to Blaze plan
- Optimize queries to reduce operations

## Production Setup

For production:

1. **Enable stronger security rules** (stricter validation)
2. **Enable backups** in Firestore settings
3. **Set up monitoring** in Firebase console
4. **Configure custom domain** for hosting
5. **Enable Firestore backups** for disaster recovery
6. **Set up alerts** for quota usage
7. **Use environment variables** for configuration

## Additional Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/start)
- [Firebase Authentication](https://firebase.google.com/docs/auth)
