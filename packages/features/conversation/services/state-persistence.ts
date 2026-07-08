import { Conversation } from '@packages/shared';
import { SupabasePersistence } from '@packages/shared/api-client/supabase-client';

const STORAGE_KEY = 'multi-agent-conversations';

export class StatePersistence {
  // LocalStorage fallback
  static saveConversationsLocalStorage(conversations: Map<string, any>): void {
    const data = Array.from(conversations.entries()).map(([id, conv]) => ({
      id,
      ...conv
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  static loadConversationsLocalStorage(): Map<string, any> {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return new Map();

      return new Map(
        JSON.parse(data).map((conv: any) => [conv.id, conv])
      );
    } catch (error) {
      console.error('Failed to load conversations from localStorage:', error);
      return new Map();
    }
  }

  // Supabase integration (primary storage)
  static saveConversationsSupabase(conversations: Map<string, any>): Promise<void> {
    return SupabasePersistence.saveConversations(conversations);
  }

  static loadConversationsSupabase(): Promise<Map<string, any>> {
    return SupabasePersistence.loadConversations();
  }

  // Save to both LocalStorage and Supabase
  static saveConversations(conversations: Map<string, any>): void {
    const data = Array.from(conversations.entries()).map(([id, conv]) => ({
      id,
      ...conv
    }));

    // Save to LocalStorage (fallback)
    this.saveConversationsLocalStorage(conversations);

    // Save to Supabase (primary)
    this.saveConversationsSupabase(conversations).catch(error => {
      console.error('Failed to save to Supabase:', error);
      // Continue using LocalStorage
    });
  }

  static loadConversations(): Promise<Map<string, any>> {
    // Try Supabase first
    return SupabasePersistence.loadConversations().catch(error => {
      console.error('Failed to load from Supabase:', error);
      // Fall back to LocalStorage
      return this.loadConversationsLocalStorage();
    });
  }

  static saveConversation(conversationId: string, conversation: Conversation): Promise<void> {
    // Save to LocalStorage (fallback)
    const localStorage = new Map([[conversationId, conversation]]);
    this.saveConversationsLocalStorage(localStorage);

    // Save to Supabase (primary)
    return SupabasePersistence.saveConversation(conversationId, conversation).catch(error => {
      console.error('Failed to save to Supabase:', error);
    });
  }

  static loadConversation(conversationId: string): Promise<Conversation | null> {
    return SupabasePersistence.loadConversation(conversationId).catch(error => {
      console.error('Failed to load from Supabase:', error);
      // Fall back to LocalStorage
      const localStorage = this.loadConversationsLocalStorage();
      return localStorage.get(conversationId) || null;
    });
  }

  static deleteConversation(conversationId: string): Promise<void> {
    // Delete from LocalStorage
    const localStorage = this.loadConversationsLocalStorage();
    localStorage.delete(conversationId);
    this.saveConversationsLocalStorage(localStorage);

    // Delete from Supabase
    return SupabasePersistence.deleteConversation(conversationId).catch(error => {
      console.error('Failed to delete from Supabase:', error);
    });
  }
}
