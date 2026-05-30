# Development Guide

## Project Overview

Nakshatra Stock Management System is built with:
- **Frontend**: React 18 + TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Backend**: Firebase (Firestore + Auth)
- **Build Tool**: Vite

## Development Setup

### Prerequisites
```bash
Node.js >= 16.x
npm >= 8.x
Git
Firebase CLI (optional, for deployment)
```

### Installation

1. **Clone repository**
```bash
git clone <repo-url>
cd nakshatra-stock-management
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure Firebase**
   - See `FIREBASE_SETUP.md` for detailed instructions
   - Update `src/config/firebase.ts` with your Firebase credentials

4. **Start development server**
```bash
npm run dev
```

Server runs on `http://localhost:5173`

## Project Structure Explained

### `/src/components/`
Reusable UI components:
- `Button.tsx` - Stylized button with variants (primary, secondary, outline, danger)
- `Input.tsx` - Text input field with validation
- `Select.tsx` - Dropdown selector
- `Card.tsx` - Container component
- `Modal.tsx` - Dialog component
- `Layout.tsx` - Main layout with sidebar
- `Sidebar.tsx` - Navigation sidebar
- `Alert.tsx` - Alert messages
- `Loading.tsx` - Loading spinner

### `/src/pages/`
Page components (full screens):
- `LoginPage.tsx` - Authentication page
- `DashboardPage.tsx` - Main dashboard
- `RawMaterialsPage.tsx` - Material inventory management
- `ProductsPage.tsx` - Product management
- `ProductionPage.tsx` - Daily production entry
- `MaterialUsagePage.tsx` - Material usage tracking
- `ReportsPage.tsx` - Report generation
- `UsersPage.tsx` - User management (admin only)

### `/src/services/`
Firebase service functions:
- `authService.ts` - Login, logout, auth state
- `rawMaterialService.ts` - Raw material CRUD
- `productService.ts` - Product CRUD
- `productionService.ts` - Production entry CRUD
- `materialUsageService.ts` - Usage tracking CRUD
- `userService.ts` - User management

### `/src/store/`
Zustand state management:
- `authStore.ts` - Global auth state

### `/src/types/`
TypeScript type definitions:
- `index.ts` - All app types and interfaces

### `/src/config/`
Configuration files:
- `firebase.ts` - Firebase initialization

## Available Scripts

```bash
# Start development server (hot reload)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter (if configured)
npm run lint
```

## Coding Standards

### TypeScript
- Use strict typing
- Define interfaces for all data structures
- Avoid `any` type
- Use enums for constants

Example:
```typescript
interface User {
  id: string;
  email: string;
  role: 'admin' | 'operator' | 'viewer';
}
```

### Components
- Functional components with hooks
- Extract reusable logic
- Props should be typed
- Use meaningful component names

Example:
```typescript
interface ButtonProps {
  variant?: 'primary' | 'secondary';
  onClick?: () => void;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ variant = 'primary', ...props }) => {
  // Component logic
};
```

### State Management
- Use Zustand for global state
- Keep state minimal
- Derive computed values instead of storing
- Use middlewares for side effects

Example:
```typescript
const useAuthStore = create((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
```

### Firebase Operations
- Create service files for each collection
- Handle errors consistently
- Use Firestore transactions for multi-document updates
- Validate data before writing

Example:
```typescript
async create(data: RawMaterial) {
  try {
    const docRef = await addDoc(collection(db, 'raw_materials'), data);
    return { success: true, id: docRef.id };
  } catch (error) {
    throw new Error(`Failed: ${error.message}`);
  }
}
```

## Common Tasks

### Adding a New Page

1. Create component in `/src/pages/PageName.tsx`
2. Add route in `App.tsx`
3. Add navigation link in `Sidebar.tsx` (if needed)
4. Export in `/src/pages/index.ts`

### Adding a New Component

1. Create in `/src/components/ComponentName.tsx`
2. Define TypeScript props interface
3. Export in `/src/components/index.ts`
4. Import and use in pages

### Adding a New Service

1. Create in `/src/services/entityService.ts`
2. Define CRUD operations
3. Handle Firestore operations
4. Add TypeScript types in `/src/types/index.ts`

### Adding Form Validation

```typescript
const [errors, setErrors] = useState<Record<string, string>>({});

const validateForm = () => {
  const newErrors: Record<string, string> = {};
  
  if (!formData.name) {
    newErrors.name = 'Name is required';
  }
  if (!formData.email) {
    newErrors.email = 'Email is required';
  }
  
  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
};
```

## Performance Optimization

### Code Splitting
- Components are lazily loaded via routing
- Large lists use pagination/virtualization

### Caching
- Use localStorage for non-sensitive data
- Implement request caching in services
- Use React Query (optional) for server state

### Lazy Loading
```typescript
const Component = React.lazy(() => import('./Component'));

<Suspense fallback={<Loading />}>
  <Component />
</Suspense>
```

## Debugging

### Browser DevTools
- React DevTools for component inspection
- Redux DevTools for state inspection (if added)

### Firebase Console
- Check Firestore data
- Monitor Authentication
- Review Security Rules violations
- Check resource usage

### Console Logs
```typescript
console.log('Debug info:', data);
console.error('Error occurred:', error);
console.warn('Warning:', message);
```

## Testing (Future Implementation)

```bash
# Will implement Jest for unit tests
# Will implement Cypress for E2E tests
npm test
```

## Error Handling

### API Errors
```typescript
try {
  await firebaseOperation();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  setError(message);
  // Show error to user
}
```

### Form Validation
```typescript
if (!validateForm()) {
  setError('Please fix form errors');
  return;
}
```

## Security Best Practices

1. **Never store secrets in code**
   - Use environment variables
   - Firebase credentials are public-safe

2. **Validate user input**
   - Firestore rules enforce this
   - Add client-side validation for UX

3. **Use HTTPS**
   - Critical in production
   - Firebase Hosting provides this

4. **Firestore Security Rules**
   - Implement role-based access
   - Validate data on write

5. **Authentication**
   - Use Firebase Auth
   - Implement logout properly

## Deployment

### Development
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm run preview
```

### Deploy to Firebase Hosting
```bash
firebase login
firebase init hosting
firebase deploy
```

## Troubleshooting

### "Cannot find module" errors
```bash
npm install
npm run dev
```

### Hot reload not working
```bash
# Restart dev server
# Check if port 5173 is available
```

### Firebase connection errors
- Verify credentials in `firebase.ts`
- Check internet connection
- Verify Firestore rules allow access

### Tailwind CSS not applied
- Check if `index.css` is imported in `main.tsx`
- Rebuild: `npm run build`
- Clear cache: `npm run dev`

## Resources

- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Firebase Docs](https://firebase.google.com/docs)
- [Zustand](https://github.com/pmndrs/zustand)

## Next Steps

1. Set up Firebase project
2. Configure credentials
3. Create demo users
4. Run `npm run dev`
5. Test login flow
6. Create sample data
7. Test each feature
8. Deploy to Firebase Hosting

---

**Last Updated**: May 2026
**Maintainer**: Development Team
