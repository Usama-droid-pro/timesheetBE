# OBS Task Manager Backend

A comprehensive Node.js backend API for the OBS Task Manager application, built with Express, MongoDB, and JWT authentication.

## Features

- **Role-based Authentication**: JWT-based authentication with role management (QA, DESIGN, DEV, PM, Admin)
- **User Management**: Admin-only user creation, password updates, and soft deletion
- **Project Management**: Create, retrieve, and manage projects
- **Task Logging**: Comprehensive task logging with date-based tracking
- **Grand Reporting**: Advanced reporting with role-based hour aggregation
- **Soft Deletes**: All deletions are soft deletes to maintain data integrity
- **Input Validation**: Comprehensive validation using express-validator
- **Error Handling**: Standardized error responses and global error handling

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: bcryptjs
- **Validation**: express-validator
- **CORS**: Enabled for frontend integration

## Project Structure

```
obs-task-manager-backend/
├── controllers/          # HTTP request handlers
│   ├── authController.js
│   ├── userController.js
│   ├── projectController.js
│   ├── tasklogController.js
│   └── reportController.js
├── services/             # Business logic layer
│   ├── authService.js
│   ├── userService.js
│   ├── projectService.js
│   ├── tasklogService.js
│   └── reportService.js
├── routes/               # API route definitions
│   ├── authRoutes.js
│   ├── userRoutes.js
│   ├── projectRoutes.js
│   ├── tasklogRoutes.js
│   └── reportRoutes.js
├── middlewares/          # Custom middleware
│   ├── authMiddleware.js
│   └── errorHandler.js
├── models/               # Mongoose models
│   ├── User.js
│   ├── Project.js
│   └── TaskLog.js
├── utils/                # Utility functions
│   ├── responseHandler.js
│   └── seedAdmin.js
├── server.js             # Main application entry point
├── package.json          # Dependencies and scripts
├── .env                  # Environment variables
├── .env.example          # Environment variables template
├── API_DOCUMENTATION.md  # Complete API documentation
└── README.md             # This file
```

## Quick Start

### Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or cloud instance)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd obs-task-manager-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env
   ```
   
   Update the `.env` file with your configuration:
   ```env
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/obs-taskmanager
   JWT_SECRET=your-super-secret-jwt-key
   JWT_EXPIRES_IN=7d
   ADMIN_NAME=Super Admin
   ADMIN_EMAIL=admin@obs.com
   ADMIN_PASSWORD=Admin@123
   FRONTEND_URL=http://localhost:3000
   ```

4. **Start MongoDB**
   ```bash
   # If using local MongoDB
   mongod
   ```

5. **Run the application**
   ```bash
   # Development mode with auto-restart
   npm run dev
   
   # Production mode
   npm start
   ```

6. **Verify installation**
   ```bash
   # Health check
   curl http://localhost:5000/health
   
   # Login as admin
   curl -X POST http://localhost:5000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email": "admin@obs.com", "password": "Admin@123"}'
   ```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user data

### User Management (Admin Only)
- `POST /api/users` - Create new user
- `GET /api/users` - Get all users
- `PUT /api/users/:id/password` - Update user password
- `DELETE /api/users/:id` - Soft delete user

### Project Management
- `POST /api/projects` - Create new project
- `GET /api/projects` - Get all projects
- `DELETE /api/projects/:id` - Soft delete project (Admin only)

### Task Logging
- `POST /api/tasklogs` - Create or update task log
- `GET /api/tasklogs` - Get task logs with filters
- `GET /api/tasklogs/single` - Get single task log by user and date

### Reports (Admin Only)
- `GET /api/reports/grand` - Generate grand report with role-based hour tracking

## Database Models

### User
```javascript
{
  _id: ObjectId,
  name: String (required, 2-100 chars),
  email: String (required, unique, valid email),
  password: String (required, bcrypt hashed, min 8 chars),
  role: Enum ['QA', 'DESIGN', 'DEV', 'PM', 'Admin'] (required),
  isDeleted: Boolean (default: false),
  createdAt: Date,
  updatedAt: Date
}
```

### Project
```javascript
{
  _id: ObjectId,
  name: String (required, 2-200 chars, unique),
  description: String (optional, max 1000 chars),
  isDeleted: Boolean (default: false),
  createdAt: Date,
  updatedAt: Date
}
```

### TaskLog
```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: User, required),
  date: Date (required),
  totalHours: Number (required, must equal sum of task hours),
  tasks: [{
    project_name: String (required, 1-200 chars),
    description: String (optional, max 1000 chars),
    hours: Number (required, 0-24)
  }],
  isDeleted: Boolean (default: false),
  createdAt: Date,
  updatedAt: Date
}
```

## Key Features

### Super Admin Auto-Creation
On application startup, a super admin user is automatically created/updated based on environment variables:
- Email: `ADMIN_EMAIL`
- Name: `ADMIN_NAME`
- Password: `ADMIN_PASSWORD`
- Role: Admin

### Task Log Update Logic
- If a task log exists for a user on a specific date, it updates the existing record
- Otherwise, it creates a new record
- Validates that totalHours equals the sum of individual task hours

### Grand Report Aggregation
- Groups task logs by project name
- Calculates hours worked by each role (QA, DESIGN, DEV, PM)
- Supports date range filtering
- Returns comprehensive totals and project breakdowns

### Security Features
- Password hashing with bcryptjs (10 salt rounds)
- JWT token validation on protected routes
- Role-based access control
- Input validation and sanitization
- Soft deletes to maintain data integrity

## Development

### Scripts
```bash
npm start          # Start production server
npm run dev        # Start development server with nodemon
npm test           # Run tests (not implemented yet)
```

### Environment Variables
See `.env.example` for all required environment variables.

### API Documentation
Complete API documentation is available in `API_DOCUMENTATION.md` with:
- Endpoint descriptions
- Request/response examples
- Validation rules
- cURL examples
- Error handling

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions, please contact the development team or create an issue in the repository.
# timesheetBE
