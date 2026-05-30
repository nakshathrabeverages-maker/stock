# Getting Started with Nakshatra Stock Management System

Welcome to **Nakshatra Stock & Production Management System**! This guide will help you get up and running quickly.

## ✅ Quick Start (5 minutes)

### 1. Prerequisites Installed
- ✅ Node.js (v16+)
- ✅ npm installed
- ✅ All dependencies downloaded

### 2. Configure Firebase

1. **Log in to Firebase Console**
   - Visit [console.firebase.google.com](https://console.firebase.google.com)
   - Sign in with your Google account

2. **Create Firebase Project**
   - Click "Create a project"
   - Name: `Nakshatra Stock Management`
   - Click Create

3. **Get Your Credentials**
   - Go to Project Settings (⚙️ icon)
   - Scroll to "Your apps" section
   - Click Create app (for web)
   - Copy your Firebase config

4. **Update Configuration**
   Open `src/config/firebase.ts` and replace with your credentials:
   ```typescript
   const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
     projectId: "YOUR_PROJECT_ID",
     storageBucket: "YOUR_PROJECT_ID.appspot.com",
     messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
     appId: "YOUR_APP_ID"
   };
   ```

### 3. Enable Firebase Services

#### Authentication
1. Go to **Authentication** section
2. Click **Get Started**
3. Enable **Email/Password** sign-in

#### Firestore Database
1. Go to **Firestore Database**
2. Click **Create database**
3. Start in **test mode** (for development)
4. Select region (recommended: asia-south1)
5. Click Create

#### Create Collections
In Firestore, create these empty collections:
- `users` - User accounts and roles
- `raw_materials` - Inventory items
- `products` - Product catalog
- `production_entries` - Daily production logs
- `material_usage` - Material consumption logs
- `stock_transactions` - Audit trail

### 4. Create Demo User (Optional)

In Firebase Auth, create a test user:
- Email: `admin@nakshatra.com`
- Password: `Demo@123`

### 5. Run the Application

```bash
# Start development server
npm run dev
```

Visit `http://localhost:5173` in your browser.

**Login with:**
- Email: `admin@nakshatra.com`
- Password: `Demo@123` (or your demo user password)

---

## 🎯 Key Features

### Authentication
- Secure login/logout
- Role-based access (Admin, Operator, Viewer)
- Session management

### Dashboard
- Real-time production monitoring
- Stock level overview
- Low stock alerts
- System status

### Inventory Management
- Add/edit/disable raw materials
- Track stock levels
- Set minimum alert levels
- Auto-categorization

### Production Tracking
- Record daily production
- Track by product
- Add production remarks
- View production history

### Material Usage
- Log raw material consumption
- Track usage by date
- Automatic stock updates
- Usage history

### Reports
- Daily production reports
- Material usage analysis
- Stock status reports
- Low stock alerts
- CSV export

### User Management
- Create user accounts
- Assign roles
- Enable/disable users
- Activity tracking

---

## 📱 Accessing the System

### Desktop
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Responsive layout for all screen sizes
- Large buttons optimized for click accuracy

### Mobile
- Full mobile responsiveness
- Touch-friendly interface
- Mobile-optimized layouts

---

## 🧑‍💼 Role-Based Access

### Admin
- Full system access
- Manage raw materials
- Manage products
- Manage users
- View all reports

### Operator
- Production entry
- Material usage tracking
- View dashboard
- View reports

### Viewer
- View-only access
- Dashboard visibility
- Report viewing

---

## 🔧 Common Tasks

### Add a Raw Material
1. Login as Admin
2. Go to "Raw Materials"
3. Click "Add New Material"
4. Fill in:
   - Name (e.g., "250ML Preform")
   - Category (e.g., "Preforms")
   - Unit (e.g., "kg")
   - Current stock
   - Minimum alert level
5. Click Save

### Record Daily Production
1. Login as Operator
2. Go to "Daily Production"
3. Click "Add Production Entry"
4. Select:
   - Date
   - Product
   - Quantity produced
5. Add remarks (optional)
6. Click Save

### Check Low Stock
1. Go to Dashboard
2. View "Low Stock Items" card
3. Items below minimum level are highlighted
4. Click on item for more details

### Generate Report
1. Go to "Reports"
2. Select report type:
   - Daily Production
   - Material Usage
   - Stock Report
   - Low Stock Alert
3. Select date range
4. Click "Generate Report"
5. Export as CSV if needed

---

## 🐛 Troubleshooting

### "Cannot login"
- Check if user exists in Firebase Auth
- Verify email and password
- Check internet connection

### "Data not showing"
- Verify Firestore collections exist
- Check Security Rules in Firebase Console
- Ensure user has permission to view data

### "Slow performance"
- Check internet connection
- Clear browser cache
- Reload the page

### "404 - Page not found"
- Ensure you're logged in
- Check URL is correct
- Refresh the page

---

## 📊 Sample Data Setup

To test the full system, add sample data:

### Sample Raw Materials
1. 250ML Preform (Preforms) - Stock: 1000 kg
2. 500ML Preform (Preforms) - Stock: 800 kg
3. White Cap (Caps) - Stock: 5000 pieces
4. Blue Cap (Caps) - Stock: 3000 pieces
5. Lavin Sticker (Stickers) - Stock: 2000 sheets
6. Calcium (Minerals) - Stock: 500 kg

### Sample Products
1. LAVIN 250ML - Brand: Lavin
2. LAVIN 500ML - Brand: Lavin
3. B2 500ML - Brand: B2
4. NATURAL 500ML - Brand: Natural Water

### Sample Production Entry
- Date: Today
- Product: LAVIN 250ML
- Quantity: 1000
- Remarks: Routine production

---

## 📞 Support & Help

### Documentation
- [Firebase Setup Guide](./FIREBASE_SETUP.md) - Cloud configuration
- [Development Guide](./DEVELOPMENT.md) - Coding guidelines
- [README.md](./README.md) - Full documentation

### Common Issues
1. **Login Issues**
   - Check Firebase credentials in config
   - Verify user in Firebase Auth
   - Clear browser cookies

2. **Data Issues**
   - Verify Firestore collections
   - Check Database visibility rules
   - Examine browser console for errors

3. **Performance Issues**
   - Check internet speed
   - Verify Firebase plan limits
   - Check browser performance

---

## 🚀 Next Steps

1. ✅ Set up Firebase (completed in step 2-3)
2. ✅ Create demo account (completed in step 4)
3. ⬜ Add sample raw materials
4. ⬜ Add sample products
5. ⬜ Create sample production entries
6. ⬜ Test reports generation
7. ⬜ Create additional user accounts

---

## 📝 Important Notes

- **Mobile-First Design**: The system is optimized for factory floor usage
- **Real-Time Updates**: Changes sync immediately across devices
- **Data Backup**: Firestore provides automatic backups
- **Security**: All data is encrypted in transit and at rest

---

## 💡 Tips for Best Experience

1. **Use Chrome/Firefox** for best compatibility
2. **Enable notifications** for low stock alerts
3. **Bookmark the app** URL for quick access
4. **Create user accounts** for each operator
5. **Regular backups** of critical data (built-in with Firebase)

---

**Version**: 1.0.0
**Last Updated**: May 2026
**Status**: ✅ Ready for Production

Need more help? Check the [Development Guide](./DEVELOPMENT.md) or Firebase documentation.
