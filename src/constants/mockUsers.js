import { ROLES } from './roles';

const MOCK_USERS = Object.freeze([
  {
    id: 'u-10001',
    name: 'Alice Admin',
    email: 'alice.admin@horizon.com',
    role: ROLES.ADMIN,
    avatar: 'AA',
  },
  {
    id: 'u-10002',
    name: 'Leo Lead',
    email: 'leo.lead@horizon.com',
    role: ROLES.ARE_LEAD,
    avatar: 'LL',
  },
  {
    id: 'u-10003',
    name: 'Vera Viewer',
    email: 'vera.viewer@horizon.com',
    role: ROLES.VIEW_ONLY,
    avatar: 'VV',
  },
]);

/**
 * Find a mock user by email address.
 * @param {string} email - The email to look up.
 * @returns {Object|null} The matching mock user or null.
 */
const findMockUserByEmail = (email) => {
  if (!email) {
    return null;
  }

  return MOCK_USERS.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
};

/**
 * Find a mock user by user id.
 * @param {string} userId - The user id to look up.
 * @returns {Object|null} The matching mock user or null.
 */
const findMockUserById = (userId) => {
  if (!userId) {
    return null;
  }

  return MOCK_USERS.find((user) => user.id === userId) ?? null;
};

/**
 * Get all mock users as an array.
 * @returns {Object[]} Array of mock user objects.
 */
const getAllMockUsers = () => {
  return [...MOCK_USERS];
};

export { MOCK_USERS, findMockUserByEmail, findMockUserById, getAllMockUsers };