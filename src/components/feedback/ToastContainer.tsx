import React, { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { removeToast, ToastItem } from '../../features/toast/toastSlice';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

interface ToastCardProps {
  toast: ToastItem;
  index: number;
  totalCount: number;
}

const ToastCard: React.FC<ToastCardProps> = ({ toast, index, totalCount }) => {
  const dispatch = useAppDispatch();
  const [isPaused, setIsPaused] = useState(false);
  const remainingTimeRef = useRef(toast.duration || 4000);
  const startTimeRef = useRef(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isPaused) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const elapsed = Date.now() - startTimeRef.current;
      remainingTimeRef.current = Math.max(0, remainingTimeRef.current - elapsed);
      return;
    }

    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      dispatch(removeToast(toast.id));
    }, remainingTimeRef.current);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [dispatch, isPaused, toast.id]);

  const handleDismiss = () => {
    dispatch(removeToast(toast.id));
  };

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />;
      case 'info':
      default:
        return <Info className="w-5 h-5 text-sky-600 shrink-0" />;
    }
  };

  const getBorderColor = () => {
    switch (toast.type) {
      case 'success':
        return 'border-emerald-200 bg-white';
      case 'error':
        return 'border-rose-200 bg-white';
      case 'warning':
        return 'border-amber-200 bg-white';
      case 'info':
      default:
        return 'border-sky-200 bg-white';
    }
  };

  const getProgressBarColor = () => {
    switch (toast.type) {
      case 'success':
        return 'bg-emerald-500';
      case 'error':
        return 'bg-rose-500';
      case 'warning':
        return 'bg-amber-500';
      case 'info':
      default:
        return 'bg-sky-500';
    }
  };

  // Calculate dynamic z-index: newest notification gets highest z-index
  // index 0 = oldest, index (totalCount - 1) = newest
  const zIndex = 3001 + index;
  
  // Calculate vertical offset for overlapping stack
  // Newest (highest index) at offset 0, older ones offset downward
  const verticalOffset = (totalCount - 1 - index) * 72; // 72px spacing between overlapping toasts

  return (
    <div
      role="alert"
      aria-live="polite"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      className={`absolute w-84 max-w-[calc(100vw-2rem)] rounded-xl border shadow-xl p-4 overflow-hidden transition-all duration-300 ease-out ${getBorderColor()}`}
      style={{
        zIndex,
        bottom: `${verticalOffset}px`,
        right: 0,
      }}
    >
      <div className="flex items-start gap-3">
        <div className="pt-0.5">{getIcon()}</div>
        <div className="flex-1 pr-2">
          {toast.title && (
            <h4 className="text-sm font-semibold text-stone-900 leading-tight">
              {toast.title}
            </h4>
          )}
          <p className="text-xs text-stone-600 mt-0.5 leading-relaxed">
            {toast.message}
          </p>
        </div>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss notification"
          className="text-stone-400 hover:text-stone-700 p-1 rounded-md hover:bg-stone-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Mandatory Progress Bar: moving from right to left */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-stone-100 overflow-hidden">
        <div
          className={`h-full ${getProgressBarColor()}`}
          style={{
            animation: `progress-rtl ${toast.duration || 4000}ms linear forwards`,
            animationPlayState: isPaused ? 'paused' : 'running',
            transformOrigin: 'right',
          }}
        />
      </div>
    </div>
  );
};

export const ToastContainer: React.FC = () => {
  const toasts = useAppSelector((state) => state.toast.toasts);

  if (toasts.length === 0) return null;

  return (
    <aside 
      aria-label="Notifications" 
      className="fixed bottom-5 right-5 z-[100] pointer-events-none"
      style={{
        width: '336px', // w-84 = 21rem = 336px
        maxWidth: 'calc(100vw - 2rem)',
      }}
    >
      <div className="relative pointer-events-auto" style={{ height: `${Math.max(120, 72 * toasts.length)}px` }}>
        {toasts.map((toast, index) => (
          <ToastCard 
            key={toast.id} 
            toast={toast} 
            index={index}
            totalCount={toasts.length}
          />
        ))}
      </div>
    </aside>
  );
};
