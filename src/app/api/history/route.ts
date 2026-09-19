import { NextRequest, NextResponse } from 'next/server';
import {
  getAllConversations,
  getMessages,
  deleteConversation,
  deleteAllConversations,
} from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get('id');

  if (conversationId) {
    const messages = getMessages(conversationId);
    return NextResponse.json({ messages });
  }

  const conversations = getAllConversations();
  return NextResponse.json({ conversations });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get('id');

  if (conversationId === 'all') {
    deleteAllConversations();
    return NextResponse.json({ success: true });
  }

  if (conversationId) {
    deleteConversation(conversationId);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'id required' }, { status: 400 });
}
