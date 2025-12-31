import Redis from 'ioredis';

const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
});

redisClient.on('connect', () => {
  console.log('✅ Redis connected successfully');
});

redisClient.on('error', (error) => {
  console.error('❌ Redis connection error:', error);
});

// Cache helper functions
export const cacheService = {
  async get(key: string): Promise<any> {
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Redis get error:', error);
      return null;
    }
  },

  async set(key: string, value: any, expirationInSeconds?: number): Promise<void> {
    try {
      const stringValue = JSON.stringify(value);
      if (expirationInSeconds) {
        await redisClient.setex(key, expirationInSeconds, stringValue);
      } else {
        await redisClient.set(key, stringValue);
      }
    } catch (error) {
      console.error('Redis set error:', error);
    }
  },

  async delete(key: string): Promise<void> {
    try {
      await redisClient.del(key);
    } catch (error) {
      console.error('Redis delete error:', error);
    }
  },

  async deletePattern(pattern: string): Promise<void> {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch (error) {
      console.error('Redis delete pattern error:', error);
    }
  },

  async exists(key: string): Promise<boolean> {
    try {
      const result = await redisClient.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Redis exists error:', error);
      return false;
    }
  },

  async increment(key: string): Promise<number> {
    try {
      return await redisClient.incr(key);
    } catch (error) {
      console.error('Redis increment error:', error);
      return 0;
    }
  },

  async expire(key: string, seconds: number): Promise<void> {
    try {
      await redisClient.expire(key, seconds);
    } catch (error) {
      console.error('Redis expire error:', error);
    }
  },
};

export default redisClient;