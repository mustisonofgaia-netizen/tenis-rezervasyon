export type ReservationMetadata = {
  userId: string;
  date: string;
  slotTime: string;
};

const BASKET_ID_PREFIX = 'court-';
const BASKET_ID_PATTERN = /^court-(\d{4}-\d{2}-\d{2})-(\d{2}:\d{2})$/;
const CONVERSATION_ID_PATTERN =
  /^(.+)-(\d{4}-\d{2}-\d{2})-(\d{2}:\d{2})-(\d+)$/;

export function buildConversationId(
  userId: string,
  date: string,
  slotTime: string,
): string {
  return `${userId}-${date}-${slotTime}-${Date.now()}`;
}

export function buildBasketId(date: string, slotTime: string): string {
  return `${BASKET_ID_PREFIX}${date}-${slotTime}`;
}

export function parseBasketId(
  basketId: string,
): Pick<ReservationMetadata, 'date' | 'slotTime'> | null {
  const match = BASKET_ID_PATTERN.exec(basketId);
  if (!match) {
    return null;
  }

  return {
    date: match[1],
    slotTime: match[2],
  };
}

export function parseConversationId(
  conversationId: string,
): ReservationMetadata | null {
  const match = CONVERSATION_ID_PATTERN.exec(conversationId);
  if (!match) {
    return null;
  }

  return {
    userId: match[1],
    date: match[2],
    slotTime: match[3],
  };
}

export function resolveReservationMetadata(input: {
  basketId?: string;
  conversationId?: string;
}): ReservationMetadata | null {
  const fromConversation = input.conversationId
    ? parseConversationId(input.conversationId)
    : null;

  const fromBasket = input.basketId ? parseBasketId(input.basketId) : null;

  if (fromConversation && fromBasket) {
    if (
      fromConversation.date !== fromBasket.date ||
      fromConversation.slotTime !== fromBasket.slotTime
    ) {
      return null;
    }

    return fromConversation;
  }

  if (fromConversation) {
    return fromConversation;
  }

  if (fromBasket) {
    return {
      userId: '',
      date: fromBasket.date,
      slotTime: fromBasket.slotTime,
    };
  }

  return null;
}
