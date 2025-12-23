# OBS Task Manager Backend - API Documentation

## Overview
This document provides comprehensive API documentation for the OBS Task Manager backend. All APIs follow a consistent response format and include proper authentication and validation.

## Base URL
```
http://localhost:5000/api
```

## Authentication
Most endpoints require JWT authentication. Include the token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Response Format

### Success Response
```json
{
  "success": true,
  "message": "Success message",
  "data": { /* actual data */ }
}
```

### Error Response
```json
{
  "success": false,
  "message": "User-friendly error message",
  "error": "Technical error details (dev mode only)"
}
```

## Status Codes
- **200**: Success
- **201**: Created
- **400**: Bad Request (validation errors)
- **401**: Unauthorized (invalid/missing token)
- **403**: Forbidden (insufficient permissions)
- **404**: Not Found
- **500**: Internal Server Error

---

## Authentication APIs

### POST /api/auth/login
Login user with email and password.

**Authentication**: Not required

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Validation Rules**:
- Email: Valid email format
- Password: Minimum 8 characters

**Success Response** (200):
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "user_id",
      "name": "John Doe",
      "email": "user@example.com",
      "role": "DEV",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    },
    "token": "jwt_token_here"
  }
}
```

**Error Response** (401):
```json
{
  "success": false,
  "message": "Invalid email or password"
}
```

**Example cURL**:
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@obs.com", "password": "Admin@123"}'
```

### GET /api/auth/me
Get current user data.

**Authentication**: Required

**Success Response** (200):
```json
{
  "success": true,
  "message": "User data retrieved successfully",
  "data": {
    "user": {
      "id": "user_id",
      "name": "John Doe",
      "email": "user@example.com",
      "role": "DEV",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

**Example cURL**:
```bash
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer your_jwt_token"
```

---

## User Management APIs (Admin Only)

### POST /api/users
Create a new user.

**Authentication**: Required (Admin only)

**Request Body**:
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "DEV"
}
```

**Validation Rules**:
- Name: 2-100 characters
- Email: Valid email format, unique
- Password: Minimum 8 characters
- Role: Must be one of ['QA', 'DESIGN', 'DEV', 'PM', 'Admin']

**Success Response** (201):
```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "user": {
      "id": "user_id",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "DEV",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

### GET /api/users
Get all users (excludes soft deleted).

**Authentication**: Required (Admin only)

**Success Response** (200):
```json
{
  "success": true,
  "message": "Users retrieved successfully",
  "data": {
    "users": [
      {
        "id": "user_id",
        "name": "John Doe",
        "email": "john@example.com",
        "role": "DEV",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

### PUT /api/users/:id/password
Update user password.

**Authentication**: Required (Admin only)

**Request Body**:
```json
{
  "password": "newpassword123"
}
```

**Validation Rules**:
- Password: Minimum 8 characters

**Success Response** (200):
```json
{
  "success": true,
  "message": "Password updated successfully",
  "data": {
    "user": {
      "id": "user_id",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "DEV",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

### DELETE /api/users/:id
Soft delete user.

**Authentication**: Required (Admin only)

**Success Response** (200):
```json
{
  "success": true,
  "message": "User deleted successfully",
  "data": {
    "user": {
      "id": "user_id",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "DEV",
      "deletedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

---

## Project Management APIs

### POST /api/projects
Create a new project.

**Authentication**: Required

**Request Body**:
```json
{
  "name": "Project Alpha",
  "description": "Project description here"
}
```

**Validation Rules**:
- Name: 2-200 characters, unique
- Description: Optional, max 1000 characters

**Success Response** (201):
```json
{
  "success": true,
  "message": "Project created successfully",
  "data": {
    "project": {
      "id": "project_id",
      "name": "Project Alpha",
      "description": "Project description here",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

### GET /api/projects
Get all projects (excludes soft deleted).

**Authentication**: Required

**Success Response** (200):
```json
{
  "success": true,
  "message": "Projects retrieved successfully",
  "data": {
    "projects": [
      {
        "id": "project_id",
        "name": "Project Alpha",
        "description": "Project description here",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

### DELETE /api/projects/:id
Soft delete project.

**Authentication**: Required (Admin only)

**Success Response** (200):
```json
{
  "success": true,
  "message": "Project deleted successfully",
  "data": {
    "project": {
      "id": "project_id",
      "name": "Project Alpha",
      "description": "Project description here",
      "deletedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

---

## Task Log APIs

### POST /api/tasklogs
Create or update task log. If task log exists for the user and date, it updates the existing record.

**Authentication**: Required

**Request Body**:
```json
{
  "userId": "user_id",
  "date": "2024-01-01",
  "totalHours": 8,
  "tasks": [
    {
      "project_name": "Project Alpha",
      "description": "Task description",
      "hours": 4
    },
    {
      "project_name": "Project Beta",
      "description": "Another task",
      "hours": 4
    }
  ]
}
```

**Validation Rules**:
- userId: Valid MongoDB ObjectId
- date: Valid ISO 8601 date format
- totalHours: Number, must equal sum of task hours
- tasks: Array with at least one task
- Each task: project_name (1-200 chars), description (optional, max 1000 chars), hours (0-24)

**Success Response** (200):
```json
{
  "success": true,
  "message": "Task log created successfully",
  "data": {
    "taskLog": {
      "id": "tasklog_id",
      "userId": "user_id",
      "date": "2024-01-01T00:00:00.000Z",
      "totalHours": 8,
      "tasks": [
        {
          "project_name": "Project Alpha",
          "description": "Task description",
          "hours": 4
        },
        {
          "project_name": "Project Beta",
          "description": "Another task",
          "hours": 4
        }
      ],
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "isUpdate": false
    }
  }
}
```

### GET /api/tasklogs
Get task logs with filters.

**Authentication**: Required

**Query Parameters**:
- `userId` (optional): Filter by user ID
- `startDate` (optional): Filter from date (YYYY-MM-DD)
- `endDate` (optional): Filter to date (YYYY-MM-DD)
- `project_name` (optional): Filter by project name (partial match)

**Success Response** (200):
```json
{
  "success": true,
  "message": "Task logs retrieved successfully",
  "data": {
    "taskLogs": [
      {
        "id": "tasklog_id",
        "userId": {
          "id": "user_id",
          "name": "John Doe",
          "email": "john@example.com",
          "role": "DEV"
        },
        "date": "2024-01-01T00:00:00.000Z",
        "totalHours": 8,
        "tasks": [
          {
            "project_name": "Project Alpha",
            "description": "Task description",
            "hours": 8
          }
        ],
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

### GET /api/tasklogs/single
Get single task log by userId and date.

**Authentication**: Required

**Query Parameters**:
- `userId` (required): User ID
- `date` (required): Date (YYYY-MM-DD)

**Success Response** (200):
```json
{
  "success": true,
  "message": "Task log retrieved successfully",
  "data": {
    "taskLog": {
      "id": "tasklog_id",
      "userId": {
        "id": "user_id",
        "name": "John Doe",
        "email": "john@example.com",
        "role": "DEV"
      },
      "date": "2024-01-01T00:00:00.000Z",
      "totalHours": 8,
      "tasks": [
        {
          "project_name": "Project Alpha",
          "description": "Task description",
          "hours": 8
        }
      ],
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

**Error Response** (404):
```json
{
  "success": false,
  "message": "Task log not found for the specified user and date"
}
```

---

## Report APIs (Admin Only)

### GET /api/reports/grand
Generate comprehensive grand report with role-based hour tracking.

**Authentication**: Required (Admin only)

**Query Parameters**:
- `startDate` (optional): Start date for report (YYYY-MM-DD)
- `endDate` (optional): End date for report (YYYY-MM-DD)

**Success Response** (200):
```json
{
  "success": true,
  "message": "Grand report generated successfully",
  "data": {
    "projects": [
      {
        "project": "Project Alpha",
        "totalHours": 120,
        "QA": 30,
        "DESIGN": 20,
        "DEV": 50,
        "PM": 20
      },
      {
        "project": "Project Beta",
        "totalHours": 80,
        "QA": 10,
        "DESIGN": 15,
        "DEV": 40,
        "PM": 15
      }
    ],
    "totals": {
      "totalHours": 200,
      "QA": 40,
      "DESIGN": 35,
      "DEV": 90,
      "PM": 35
    },
    "dateRange": {
      "startDate": "2024-01-01",
      "endDate": "2024-01-31"
    },
    "totalProjects": 2
  }
}
```

**Example cURL**:
```bash
curl -X GET "http://localhost:5000/api/reports/grand?startDate=2024-01-01&endDate=2024-01-31" \
  -H "Authorization: Bearer your_jwt_token"
```

---

## JWT Token Format

The JWT token contains the following payload:
```json
{
  "userId": "user_id_here",
  "role": "Admin|QA|DESIGN|DEV|PM",
  "iat": 1640995200,
  "exp": 1641600000
}
```

## Error Handling

### Common Error Messages

**Authentication Errors**:
- "Access denied. No token provided."
- "Invalid token."
- "Token expired."
- "Admin access required."

**Validation Errors**:
- "Email and password are required"
- "Password must be at least 8 characters long"
- "Role must be one of: QA, DESIGN, DEV, PM, Admin"
- "Total hours must equal the sum of individual task hours"

**Not Found Errors**:
- "User not found"
- "Project not found"
- "Task log not found for the specified user and date"

## Environment Variables

Required environment variables:
```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/obs-taskmanager
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
ADMIN_NAME=Super Admin
ADMIN_EMAIL=admin@obs.com
ADMIN_PASSWORD=Admin@123
FRONTEND_URL=http://localhost:3000
```

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file with required variables

3. Start MongoDB

4. Run the server:
```bash
npm start
# or for development
npm run dev
```

5. Test the API:
```bash
# Health check
curl http://localhost:5000/health

# Login as admin
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@obs.com", "password": "Admin@123"}'
```

## Database Schema

### User Model
- `_id`: ObjectId
- `name`: String (required, 2-100 chars)
- `email`: String (required, unique, valid email)
- `password`: String (required, bcrypt hashed, min 8 chars)
- `role`: Enum ['QA', 'DESIGN', 'DEV', 'PM', 'Admin'] (required)
- `isDeleted`: Boolean (default: false)
- `createdAt`: Date
- `updatedAt`: Date

### Project Model
- `_id`: ObjectId
- `name`: String (required, 2-200 chars, unique)
- `description`: String (optional, max 1000 chars)
- `isDeleted`: Boolean (default: false)
- `createdAt`: Date
- `updatedAt`: Date

### TaskLog Model
- `_id`: ObjectId
- `userId`: ObjectId (ref: User, required)
- `date`: Date (required)
- `totalHours`: Number (required, must equal sum of task hours)
- `tasks`: Array of objects with:
  - `project_name`: String (required, 1-200 chars)
  - `description`: String (optional, max 1000 chars)
  - `hours`: Number (required, 0-24)
- `isDeleted`: Boolean (default: false)
- `createdAt`: Date
- `updatedAt`: Date

**Indexes**:
- User.email: unique
- TaskLog: compound index (userId, date) unique
- All models: isDeleted index for soft delete queries
