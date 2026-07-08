import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);

export class SupabasePersistence {
  static async saveConversations(conversations: Map<string, any>) {
    const data = Array.from(conversations.entries()).map(([id, conv]) => ({
      id,
      ...conv
    }));

    const { error } = await supabase.from('conversations').upsert(data);
    if (error) throw error;
  }

  static async loadConversations(): Promise<Map<string, any>> {
    const { data, error } = await supabase
      .from('conversations')
      .select('*');

    if (error) throw error;

    return new Map(data?.map((conv: any) => [conv.id, conv]) || []);
  }

  static async saveConversation(conversationId: string, conversation: any) {
    const { error } = await supabase
      .from('conversations')
      .update(conversation)
      .eq('id', conversationId);

    if (error) throw error;
  }

  static async loadConversation(conversationId: string) {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (error) throw error;
    return data;
  }

  static async deleteConversation(conversationId: string) {
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId);

    if (error) throw error;
  }
}
