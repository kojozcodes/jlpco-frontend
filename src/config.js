// Single place the app learns where the backend is. The URL was previously
// repeated in each file that called the API, which is one more place to miss
// when it changes.
const API_BASE_URL = (
  process.env.REACT_APP_API_BASE_URL ||
  'https://jlpco-backend-production.up.railway.app'
).replace(/\/$/, '');

export default API_BASE_URL;
