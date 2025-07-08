// Real Estate Property Management API
// A comprehensive RESTful API for property management, rental listings, and real estate operations

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult, param, query } = require('express-validator');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// In-memory database (replace with MongoDB/PostgreSQL in production)
let properties = [
  {
    id: 1,
    title: 'Modern Downtown Apartment',
    description: 'Luxury 2-bedroom apartment in the heart of downtown',
    price: 2500,
    currency: 'USD',
    type: 'apartment',
    status: 'available',
    bedrooms: 2,
    bathrooms: 2,
    area: 1200,
    location: {
      address: '123 Main St',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      country: 'USA',
      coordinates: { lat: 40.7128, lng: -74.0060 }
    },
    amenities: ['gym', 'pool', 'parking', 'balcony', 'air_conditioning'],
    images: ['https://example.com/image1.jpg'],
    landlord: {
      id: 1,
      name: 'John Smith',
      email: 'john@example.com',
      phone: '+1-555-0123'
    },
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15')
  }
];

let users = [
  {
    id: 1,
    name: 'John Smith',
    email: 'john@example.com',
    role: 'landlord',
    phone: '+1-555-0123',
    createdAt: new Date('2024-01-01')
  }
];

let bookings = [];
let favorites = [];

// Utility functions
const generateId = (array) => Math.max(...array.map(item => item.id), 0) + 1;

const findPropertyById = (id) => properties.find(p => p.id === parseInt(id));

const findUserById = (id) => users.find(u => u.id === parseInt(id));

// Error handling middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }
  next();
};

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Real Estate API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// PROPERTIES ENDPOINTS

// Get all properties with filtering and pagination
app.get('/api/properties', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('minPrice').optional().isFloat({ min: 0 }),
  query('maxPrice').optional().isFloat({ min: 0 }),
  query('type').optional().isIn(['apartment', 'house', 'condo', 'townhouse', 'studio']),
  query('status').optional().isIn(['available', 'rented', 'maintenance']),
  query('city').optional().isString(),
  query('bedrooms').optional().isInt({ min: 0 }),
  query('bathrooms').optional().isInt({ min: 0 })
], handleValidationErrors, (req, res) => {
  let filteredProperties = [...properties];
  
  // Apply filters
  const { minPrice, maxPrice, type, status, city, bedrooms, bathrooms } = req.query;
  
  if (minPrice) filteredProperties = filteredProperties.filter(p => p.price >= parseFloat(minPrice));
  if (maxPrice) filteredProperties = filteredProperties.filter(p => p.price <= parseFloat(maxPrice));
  if (type) filteredProperties = filteredProperties.filter(p => p.type === type);
  if (status) filteredProperties = filteredProperties.filter(p => p.status === status);
  if (city) filteredProperties = filteredProperties.filter(p => p.location.city.toLowerCase().includes(city.toLowerCase()));
  if (bedrooms) filteredProperties = filteredProperties.filter(p => p.bedrooms >= parseInt(bedrooms));
  if (bathrooms) filteredProperties = filteredProperties.filter(p => p.bathrooms >= parseInt(bathrooms));
  
  // Pagination
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  
  const paginatedProperties = filteredProperties.slice(startIndex, endIndex);
  
  res.json({
    success: true,
    data: paginatedProperties,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(filteredProperties.length / limit),
      totalItems: filteredProperties.length,
      itemsPerPage: limit
    }
  });
});

// Get property by ID
app.get('/api/properties/:id', [
  param('id').isInt({ min: 1 })
], handleValidationErrors, (req, res) => {
  const property = findPropertyById(req.params.id);
  
  if (!property) {
    return res.status(404).json({
      success: false,
      message: 'Property not found'
    });
  }
  
  res.json({
    success: true,
    data: property
  });
});

// Create new property
app.post('/api/properties', [
  body('title').isString().isLength({ min: 5, max: 100 }),
  body('description').isString().isLength({ min: 10, max: 1000 }),
  body('price').isFloat({ min: 0 }),
  body('currency').optional().isIn(['USD', 'EUR', 'GBP', 'KES']),
  body('type').isIn(['apartment', 'house', 'condo', 'townhouse', 'studio']),
  body('bedrooms').isInt({ min: 0 }),
  body('bathrooms').isInt({ min: 0 }),
  body('area').isFloat({ min: 0 }),
  body('location.address').isString(),
  body('location.city').isString(),
  body('location.state').isString(),
  body('location.zipCode').isString(),
  body('location.country').isString(),
  body('landlord.id').isInt({ min: 1 }),
  body('amenities').optional().isArray()
], handleValidationErrors, (req, res) => {
  const landlord = findUserById(req.body.landlord.id);
  
  if (!landlord) {
    return res.status(400).json({
      success: false,
      message: 'Landlord not found'
    });
  }
  
  const newProperty = {
    id: generateId(properties),
    ...req.body,
    status: 'available',
    landlord: {
      id: landlord.id,
      name: landlord.name,
      email: landlord.email,
      phone: landlord.phone
    },
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  properties.push(newProperty);
  
  res.status(201).json({
    success: true,
    message: 'Property created successfully',
    data: newProperty
  });
});

// Update property
app.put('/api/properties/:id', [
  param('id').isInt({ min: 1 }),
  body('title').optional().isString().isLength({ min: 5, max: 100 }),
  body('description').optional().isString().isLength({ min: 10, max: 1000 }),
  body('price').optional().isFloat({ min: 0 }),
  body('status').optional().isIn(['available', 'rented', 'maintenance']),
  body('bedrooms').optional().isInt({ min: 0 }),
  body('bathrooms').optional().isInt({ min: 0 })
], handleValidationErrors, (req, res) => {
  const propertyIndex = properties.findIndex(p => p.id === parseInt(req.params.id));
  
  if (propertyIndex === -1) {
    return res.status(404).json({
      success: false,
      message: 'Property not found'
    });
  }
  
  properties[propertyIndex] = {
    ...properties[propertyIndex],
    ...req.body,
    updatedAt: new Date()
  };
  
  res.json({
    success: true,
    message: 'Property updated successfully',
    data: properties[propertyIndex]
  });
});

// Delete property
app.delete('/api/properties/:id', [
  param('id').isInt({ min: 1 })
], handleValidationErrors, (req, res) => {
  const propertyIndex = properties.findIndex(p => p.id === parseInt(req.params.id));
  
  if (propertyIndex === -1) {
    return res.status(404).json({
      success: false,
      message: 'Property not found'
    });
  }
  
  properties.splice(propertyIndex, 1);
  
  res.json({
    success: true,
    message: 'Property deleted successfully'
  });
});

// USERS ENDPOINTS

// Get all users
app.get('/api/users', (req, res) => {
  res.json({
    success: true,
    data: users.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt
    }))
  });
});

// Create new user
app.post('/api/users', [
  body('name').isString().isLength({ min: 2, max: 50 }),
  body('email').isEmail(),
  body('role').isIn(['tenant', 'landlord', 'agent']),
  body('phone').optional().isMobilePhone()
], handleValidationErrors, (req, res) => {
  // Check if email already exists
  const existingUser = users.find(u => u.email === req.body.email);
  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: 'Email already exists'
    });
  }
  
  const newUser = {
    id: generateId(users),
    ...req.body,
    createdAt: new Date()
  };
  
  users.push(newUser);
  
  res.status(201).json({
    success: true,
    message: 'User created successfully',
    data: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role }
  });
});

// BOOKINGS ENDPOINTS

// Create booking/viewing request
app.post('/api/bookings', [
  body('propertyId').isInt({ min: 1 }),
  body('userId').isInt({ min: 1 }),
  body('viewingDate').isISO8601(),
  body('message').optional().isString().isLength({ max: 500 })
], handleValidationErrors, (req, res) => {
  const property = findPropertyById(req.body.propertyId);
  const user = findUserById(req.body.userId);
  
  if (!property) {
    return res.status(404).json({
      success: false,
      message: 'Property not found'
    });
  }
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }
  
  const newBooking = {
    id: generateId(bookings),
    propertyId: parseInt(req.body.propertyId),
    userId: parseInt(req.body.userId),
    viewingDate: new Date(req.body.viewingDate),
    message: req.body.message || '',
    status: 'pending',
    createdAt: new Date()
  };
  
  bookings.push(newBooking);
  
  res.status(201).json({
    success: true,
    message: 'Booking request created successfully',
    data: newBooking
  });
});

// Get bookings
app.get('/api/bookings', (req, res) => {
  res.json({
    success: true,
    data: bookings
  });
});

// FAVORITES ENDPOINTS

// Add to favorites
app.post('/api/favorites', [
  body('propertyId').isInt({ min: 1 }),
  body('userId').isInt({ min: 1 })
], handleValidationErrors, (req, res) => {
  const { propertyId, userId } = req.body;
  
  const property = findPropertyById(propertyId);
  const user = findUserById(userId);
  
  if (!property || !user) {
    return res.status(404).json({
      success: false,
      message: 'Property or user not found'
    });
  }
  
  // Check if already in favorites
  const existingFavorite = favorites.find(f => f.propertyId === propertyId && f.userId === userId);
  if (existingFavorite) {
    return res.status(400).json({
      success: false,
      message: 'Property already in favorites'
    });
  }
  
  const newFavorite = {
    id: generateId(favorites),
    propertyId,
    userId,
    createdAt: new Date()
  };
  
  favorites.push(newFavorite);
  
  res.status(201).json({
    success: true,
    message: 'Property added to favorites',
    data: newFavorite
  });
});

// Get user favorites
app.get('/api/users/:userId/favorites', [
  param('userId').isInt({ min: 1 })
], handleValidationErrors, (req, res) => {
  const userId = parseInt(req.params.userId);
  const userFavorites = favorites.filter(f => f.userId === userId);
  
  const favoriteProperties = userFavorites.map(fav => {
    const property = findPropertyById(fav.propertyId);
    return {
      favoriteId: fav.id,
      property,
      addedAt: fav.createdAt
    };
  });
  
  res.json({
    success: true,
    data: favoriteProperties
  });
});

// ANALYTICS ENDPOINTS

// Get property analytics
app.get('/api/analytics/properties', (req, res) => {
  const totalProperties = properties.length;
  const availableProperties = properties.filter(p => p.status === 'available').length;
  const rentedProperties = properties.filter(p => p.status === 'rented').length;
  const averagePrice = properties.reduce((sum, p) => sum + p.price, 0) / totalProperties;
  
  const typeDistribution = properties.reduce((acc, p) => {
    acc[p.type] = (acc[p.type] || 0) + 1;
    return acc;
  }, {});
  
  res.json({
    success: true,
    data: {
      totalProperties,
      availableProperties,
      rentedProperties,
      averagePrice: Math.round(averagePrice),
      typeDistribution,
      totalBookings: bookings.length,
      totalFavorites: favorites.length
    }
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🏠 Real Estate API running on port ${PORT}`);
  console.log(`📱 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🏡 Properties: http://localhost:${PORT}/api/properties`);
  console.log(`👥 Users: http://localhost:${PORT}/api/users`);
});

module.exports = app;