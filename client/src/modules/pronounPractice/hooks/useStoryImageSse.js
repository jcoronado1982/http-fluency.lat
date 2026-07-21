import { useEffect } from 'react';
import { API_URL } from '../../../config/api';

/** Suscripción SSE para actualizaciones de imagen en pantallas de historia. */
export function useStoryImageSse(queryClient) {
  useEffect(() => {
    let isMounted = true;
    let eventSource = null;
    let reconnectTimeout = null;
    let retryCount = 0;

    const connectSse = () => {
      if (!isMounted) return;

      eventSource = new EventSource(`${API_URL}/api/notifications/events`);

      eventSource.onopen = () => {
        retryCount = 0;
      };

      eventSource.onmessage = (event) => {
        if (!isMounted) return;

        try {
          const data = JSON.parse(event.data);
          if (data.type !== 'SCREEN_UPDATED') return;

          queryClient.setQueryData(
            ['pronoun-practice-screens', data.episode_id],
            (oldData) => {
              if (!oldData) return oldData;
              return oldData.map((screen) =>
                screen.id === data.screen_id
                  ? {
                      ...screen,
                      content: {
                        ...screen.content,
                        image_url: data.image_url,
                      },
                    }
                  : screen,
              );
            },
          );
        } catch (err) {
          console.error('Error parsing SSE event', err);
        }
      };

      eventSource.onerror = () => {
        if (!isMounted) return;
        eventSource?.close();

        const delay = Math.min(1000 * 2 ** retryCount, 30_000);
        retryCount += 1;
        reconnectTimeout = setTimeout(connectSse, delay);
      };
    };

    connectSse();

    return () => {
      isMounted = false;
      eventSource?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      window.speechSynthesis.cancel();
    };
  }, [queryClient]);
}
