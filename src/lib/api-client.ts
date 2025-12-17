import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios'
import { toast } from 'sonner'

import { getAuthToken, removeAuthToken } from './auth-storage'

/**
 * API Base URL from environment variables
 * Default: http://localhost:8080 for development
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL //|| 'http://localhost:8080'

/**
 * API prefix for all endpoints
 */
const API_PREFIX = '/api'

/**
 * Axios instance configured for backend API calls
 * - Base URL: localhost:8080/api (development)
 * - JWT token automatically attached to requests
 * - Error handling with toast notifications
 */
const apiClient: AxiosInstance = axios.create({
  baseURL: `${API_BASE_URL}${API_PREFIX}`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

/**
 * Request Interceptor
 * Automatically attaches JWT token from localStorage to all requests
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAuthToken()

    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

/**
 * Response Interceptor
 * Handles errors globally and shows appropriate toast messages
 */
apiClient.interceptors.response.use(
  (response) => {
    // Return response data directly
    return response
  },
  (error) => {
    // Handle different error scenarios
    if (error.response) {
      const status = error.response.status
      const message = error.response.data?.message || error.message
      const url = error.config?.url || ''

      // Don't show toast for login errors (handled in login form)
      const isLoginRequest = url.includes('/auth/dashboard/login')

      switch (status) {
        case 401:
          // Unauthorized - token invalid or expired
          if (!isLoginRequest) {
            toast.error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')
            removeAuthToken()
            // Redirect to login page
            window.location.href = '/sign-in'
          }
          break

        case 403:
          // Forbidden
          toast.error('Bạn không có quyền truy cập tài nguyên này.')
          break

        case 404:
          // Not found - only show for non-login requests
          if (!isLoginRequest) {
            toast.error('Không tìm thấy tài nguyên.')
          }
          break

        case 422:
          // Validation error
          if (!isLoginRequest) {
            toast.error(message || 'Lỗi xác thực. Vui lòng kiểm tra lại thông tin.')
          }
          break

        case 500:
          // Server error
          console.error('❌ 500 Error:', {
            url,
            message,
            responseData: error.response.data,
          })
          toast.error(`Lỗi máy chủ: ${message || 'Vui lòng thử lại sau'}`)
          break

        default:
          if (!isLoginRequest) {
            toast.error(message || 'Đã xảy ra lỗi. Vui lòng thử lại.')
          }
      }
    } else if (error.request) {
      // Network error - no response received
      toast.error('Lỗi kết nối mạng. Vui lòng kiểm tra kết nối Internet.')
    } else {
      // Other errors
      toast.error('Đã xảy ra lỗi không mong muốn.')
    }

    return Promise.reject(error)
  }
)

/**
 * Generic GET request
 */
export const get = <T = unknown>(url: string, config?: AxiosRequestConfig) => {
  return apiClient.get<T>(url, config)
}

/**
 * GET request with body (non-standard but required by some endpoints)
 * Used for endpoints that require request body with GET method
 */
export const getWithBody = <T = unknown>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig
) => {
  return apiClient.request<T>({
    method: 'GET',
    url,
    data,
    headers: {
      'Content-Type': 'application/json',
    },
    ...config,
  })
}

/**
 * Generic POST request
 */
export const post = <T = unknown>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig
) => {
  return apiClient.post<T>(url, data, config)
}

/**
 * Generic PUT request
 */
export const put = <T = unknown>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig
) => {
  return apiClient.put<T>(url, data, config)
}

/**
 * Generic PATCH request
 */
export const patch = <T = unknown>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig
) => {
  return apiClient.patch<T>(url, data, config)
}

/**
 * Generic DELETE request
 */
export const del = <T = unknown>(url: string, config?: AxiosRequestConfig) => {
  return apiClient.delete<T>(url, config)
}

export default apiClient
