export interface Person {
  id: string;
  name: string;
  avatar_color: string;
  created_at: number;
}

export interface MediaItem {
  id: string;
  type: 'image' | 'video';
  url: string;
  thumbnail_url?: string;
  width?: number;
  height?: number;
}

export interface Post {
  id: string;
  author_id: string;
  content: string;
  media: MediaItem[];
  created_at: number;
  updated_at?: number;
}

export interface PostWithAuthor extends Post {
  author: Person;
}
