<script lang="ts">
  import { onMount } from 'svelte';
  import Papicon from './Papicon.svelte';

  interface CalendarEvent {
    id: string;
    title: string;
    start: Date;
    end?: Date;
    color?: string;
    icon?: string;
    type: string;
    isAllDay?: boolean;
    staffName?: string;
    avatarUrl?: string;
    details?: string;
    raw?: any;
  }

  let { view = $bindable('month'), currentDate = $bindable(new Date()), events = [], onRangeChange, onEventClick, onDateClick } = $props();
  
  // Selection state
  let isSelecting = $state(false);
  let selectionStart = $state<{ date: Date, minutes: number } | null>(null);
  let selectionEnd = $state<{ date: Date, minutes: number } | null>(null);

  const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Adjust for Monday start (0=Sun, 1=Mon... -> 0=Mon, 6=Sun)
    const offset = firstDay === 0 ? 6 : firstDay - 1;
    
    const days = [];
    
    // Prev month days
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = offset - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthDays - i),
        isCurrentMonth: false
      });
    }
    
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true
      });
    }
    
    // Next month days
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false
      });
    }
    
    return days;
  };

  const getDaysInWeek = (date: Date) => {
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
    const monday = new Date(date.setDate(diff));
    
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push({
        date: d,
        isCurrentMonth: d.getMonth() === date.getMonth()
      });
    }
    return days;
  };

  let calendarDays = $derived(view === 'month' ? getDaysInMonth(currentDate) : getDaysInWeek(new Date(currentDate)));

  function next() {
    if (view === 'month') {
      currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    } else {
      currentDate = new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
    updateRange();
  }

  function prev() {
    if (view === 'month') {
      currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    } else {
      currentDate = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
    updateRange();
  }

  function today() {
    currentDate = new Date();
    updateRange();
  }

  function updateRange() {
    const start = new Date(calendarDays[0].date);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(calendarDays[calendarDays.length - 1].date);
    end.setHours(23, 59, 59, 999);
    
    onRangeChange(start, end);
  }

  function isToday(date: Date) {
    const today = new Date();
    return date.getDate() === today.getDate() && 
           date.getMonth() === today.getMonth() && 
           date.getFullYear() === today.getFullYear();
  }

  function getEventClass(event: CalendarEvent) {
    if (event.color) return event.color;
    
    switch (event.type) {
      case 'absence': return 'bg-amber-500/10 text-amber-700 border border-amber-500/20';
      case 'vocal': return 'bg-primary/10 text-primary border border-primary/20';
      case 'meeting': return 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20';
      default: return 'bg-surface-container-high text-on-surface-variant border border-outline-variant/30';
    }
  }

  const hours = Array.from({ length: 24 }, (_, i) => i);

  function getEventStyles(event: CalendarEvent, dayEvents: CalendarEvent[]) {
    const start = new Date(event.start);
    const end = event.end ? new Date(event.end) : new Date(start.getTime() + 3600000);
    
    if (isNaN(start.getTime())) return { top: 0, height: 0, width: 0, left: 0 };

    const startMinutes = start.getHours() * 60 + start.getMinutes();
    
    // Handle events that end on a different day or have no end date
    const isSameDay = end.toDateString() === start.toDateString();
    const endMinutes = isSameDay 
      ? end.getHours() * 60 + end.getMinutes()
      : 24 * 60; // Extend to end of day if it's a multi-day event
      
    const duration = Math.max(endMinutes - startMinutes, 20); // Minimum 20 minutes for visibility


    // Better overlap handling
    const timedEvents = dayEvents
      .filter(e => !e.isAllDay)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    
    // Find events that overlap with THIS event
    const overlapping = timedEvents.filter(e => {
      const eStart = new Date(e.start).getTime();
      const eEnd = e.end ? new Date(e.end).getTime() : eStart + 3600000;
      const startT = start.getTime();
      const endT = end.getTime();
      
      return (eStart < endT && eEnd > startT);
    });
    
    const index = overlapping.findIndex(e => e.id === event.id);
    const count = Math.max(overlapping.length, 1);
    const safeIndex = index === -1 ? 0 : index;
    
    return {
      top: (startMinutes / (24 * 60)) * 100,
      height: (duration / (24 * 60)) * 100,
      width: (100 / count),
      left: (safeIndex * (100 / count))
    };
  }

  function getEventsForDate(date: Date, type: 'all' | 'allDay' | 'timed' = 'all') {
    const dayEvents = events.filter((e: CalendarEvent) => {
      const start = new Date(e.start);
      const end = e.end ? new Date(e.end) : start;
      
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      
      const s = new Date(start);
      s.setHours(0, 0, 0, 0);
      
      const ed = new Date(end);
      ed.setHours(0, 0, 0, 0);
      
      return d >= s && d <= ed;
    });

    if (type === 'allDay') {
      return dayEvents.filter(e => e.isAllDay);
    }
    if (type === 'timed') {
      return dayEvents.filter(e => !e.isAllDay);
    }
    return dayEvents;
  }

  function getGlobalTimeTop() {
    const now = new Date();
    return ((now.getHours() * 60 + now.getMinutes()) / (24 * 60)) * 100;
  }

  function handleMouseDown(date: Date, e: MouseEvent) {
    const isWeek = view === 'week';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    
    let minutes = 0;
    if (isWeek) {
      const rawMinutes = (y / rect.height) * (24 * 60);
      minutes = Math.floor(rawMinutes / 30) * 30;
    }
    
    isSelecting = true;
    selectionStart = { date, minutes };
    selectionEnd = { date, minutes: isWeek ? minutes + 30 : 1410 }; // 1410 = 23:30

    const onGlobalMouseMove = (moveEvent: MouseEvent) => {
      if (!isSelecting || !selectionStart) return;
      const element = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const cellClass = isWeek ? '.day-column' : '.month-day';
      const cell = element?.closest(cellClass) as HTMLElement;
      
      if (cell) {
        const cells = Array.from(document.querySelectorAll(cellClass));
        const index = cells.indexOf(cell);
        
        if (index !== -1) {
          const colDate = calendarDays[index].date;

          if (isWeek) {
            const colRect = cell.getBoundingClientRect();
            const colY = moveEvent.clientY - colRect.top;
            const colMinutes = Math.floor(((colY / colRect.height) * (24 * 60)) / 30) * 30;
            selectionEnd = { date: colDate, minutes: colMinutes };
          } else {
            selectionEnd = { date: colDate, minutes: 1410 };
          }
        }
      }
    };

    const onGlobalMouseUp = () => {
      if (isSelecting && selectionStart && selectionEnd) {
        let start = new Date(selectionStart.date);
        let end = new Date(selectionEnd.date);

        // Sort dates if dragged backwards
        if (start > end) {
          [start, end] = [end, start];
          const tempStart = selectionStart;
          const tempEnd = selectionEnd;
          selectionStart = { date: tempEnd.date, minutes: tempEnd.minutes };
          selectionEnd = { date: tempStart.date, minutes: tempStart.minutes };
        }

        const startDate = new Date(start);
        startDate.setHours(Math.floor(selectionStart.minutes / 60), selectionStart.minutes % 60, 0, 0);
        
        const endDate = new Date(end);
        endDate.setHours(Math.floor(selectionEnd.minutes / 60), selectionEnd.minutes % 60, 0, 0);
        
        onDateClick(startDate, endDate);
      }
      
      isSelecting = false;
      selectionStart = null;
      selectionEnd = null;
      window.removeEventListener('mousemove', onGlobalMouseMove);
      window.removeEventListener('mouseup', onGlobalMouseUp);
    };

    window.addEventListener('mousemove', onGlobalMouseMove);
    window.addEventListener('mouseup', onGlobalMouseUp);
  }

  $effect(() => {
    // When view changes, we might need to update the range
    if (view) {
      updateRange();
    }
  });

  onMount(() => {
    updateRange();
  });
</script>

<div class="calendar-container h-175 flex flex-col bg-surface-container-low rounded-4xl border border-outline-variant/30 overflow-hidden shadow-xl">
  <!-- Header -->
  <header class="p-6 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-lowest">
    <div class="flex items-center gap-4">
      <h2 class="text-xl font-black text-on-surface capitalize">
        {#if view === 'month'}
          {currentDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
        {:else}
          Semaine du {calendarDays[0].date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
        {/if}
      </h2>
      <div class="flex items-center gap-1 bg-surface-container-high/50 p-1 rounded-xl border border-outline-variant/20">
        <button onclick={prev} class="p-1.5 hover:bg-surface-hover rounded-lg transition-colors">
          <Papicon icon="chevron-left" size={18} />
        </button>
        <button onclick={today} class="px-3 py-1 text-xs font-bold hover:bg-surface-hover rounded-lg transition-colors">
          Aujourd'hui
        </button>
        <button onclick={next} class="p-1.5 hover:bg-surface-hover rounded-lg transition-colors">
          <Papicon icon="chevron-right" size={18} />
        </button>
      </div>
    </div>
    
    <div class="flex items-center gap-2">
       <div class="flex bg-surface-container p-1 rounded-xl border border-outline-variant/20">
          <button 
            onclick={() => view = 'month'} 
            class="px-4 py-1.5 rounded-lg text-xs font-bold transition-all {view === 'month' ? 'bg-primary text-white shadow-md' : 'text-on-surface-variant hover:text-on-surface'}"
          >
            Mois
          </button>
          <button 
            onclick={() => view = 'week'} 
            class="px-4 py-1.5 rounded-lg text-xs font-bold transition-all {view === 'week' ? 'bg-primary text-white shadow-md' : 'text-on-surface-variant hover:text-on-surface'}"
          >
            Semaine
          </button>
       </div>
    </div>
  </header>

  <!-- Grid -->
  <div class="calendar-grid flex flex-col flex-1 overflow-hidden">
    {#if view === 'month'}
      <div class="grid grid-cols-7 border-collapse h-full overflow-y-auto custom-scrollbar">
        <!-- Day headers -->
        {#each weekDays as day}
          <div class="p-4 text-center text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant border-b border-r border-outline-variant/10 last:border-r-0 bg-surface-container-lowest/50">
            {day}
          </div>
        {/each}

        <!-- Days -->
        {#each calendarDays as { date, isCurrentMonth }}
          {@const dayEvents = getEventsForDate(date)}
          <div 
            class="month-day min-h-[120px] p-2 border-b border-r border-outline-variant/10 last:border-r-0 hover:bg-surface-hover/30 transition-colors group {isCurrentMonth ? '' : 'bg-surface-container-high/20 opacity-50'} relative select-none"
            onmousedown={(e) => handleMouseDown(date, e)}
            role="button"
            tabindex="0"
          >
            <!-- Selection Highlight -->
            {#if isSelecting && selectionStart && selectionEnd}
              {@const startT = selectionStart.date.getTime()}
              {@const endT = selectionEnd.date.getTime()}
              {@const currentT = date.getTime()}
              {#if (currentT >= startT && currentT <= endT) || (currentT <= startT && currentT >= endT)}
                <div class="absolute inset-0 bg-primary/10 border-2 border-primary/30 z-0"></div>
              {/if}
            {/if}
            <div class="flex items-center justify-between mb-2 px-1 relative z-10">
              <span class="text-xs font-black {isToday(date) ? 'w-6 h-6 bg-primary text-white flex items-center justify-center rounded-full' : 'text-on-surface-variant'}">
                {date.getDate()}
              </span>
            </div>
            <div class="flex flex-col gap-1 overflow-y-auto overflow-x-hidden max-h-[80px] custom-scrollbar relative z-10">
              {#each dayEvents as event}
                <button 
                  onclick={(e) => { e.stopPropagation(); onEventClick(event); }}
                  onmousedown={(e) => e.stopPropagation()}
                  class="w-full text-left px-1.5 py-0.5 rounded-md text-[9px] font-bold truncate transition-all hover:scale-[1.02] shadow-sm {getEventClass(event)}"
                >
                  {#if event.avatarUrl}
                    <img src={event.avatarUrl} alt="" class="inline-block w-3 h-3 rounded-full mr-1 -mt-0.5" />
                  {/if}
                  {event.staffName ? `${event.staffName.split(' ')[0]}: ` : ''}{event.title}
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <!-- Week View with Hours -->
      <div class="flex flex-col h-full overflow-hidden">
        <!-- Week Header -->
        <div class="grid grid-cols-[60px_repeat(7,1fr)] border-b border-outline-variant/30">
          <div class="border-r border-outline-variant/10"></div>
          {#each calendarDays as { date }}
            <div class="p-3 text-center border-r border-outline-variant/10 last:border-r-0 {isToday(date) ? 'bg-primary/5' : ''}">
              <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{weekDays[(date.getDay() + 6) % 7]}</p>
              <p class="text-lg font-black {isToday(date) ? 'text-primary' : 'text-on-surface'}">{date.getDate()}</p>
            </div>
          {/each}
        </div>

        <!-- All Day Section -->
        <div class="grid grid-cols-[60px_repeat(7,1fr)] border-b border-outline-variant/30 bg-surface-container-lowest/50">
          <div class="p-2 text-[8px] font-black uppercase text-on-surface-variant flex items-center justify-center border-r border-outline-variant/10">
            Journée
          </div>
          {#each calendarDays as { date }}
            {@const allDayEvents = getEventsForDate(date, 'allDay')}
            <div 
              class="p-1 min-h-[40px] border-r border-outline-variant/10 last:border-r-0 space-y-1 overflow-hidden hover:bg-surface-hover/20 transition-colors cursor-pointer"
              onclick={() => onDateClick(date)}
              onkeydown={(e) => e.key === 'Enter' && onDateClick(date)}
              role="button"
              tabindex="0"
            >
              {#each allDayEvents.slice(0, 2) as event}
                <button 
                  onclick={(e) => { e.stopPropagation(); onEventClick(event); }}
                  onmousedown={(e) => e.stopPropagation()}
                  class="w-full text-left px-2 py-0.5 rounded-md text-[9px] font-bold truncate transition-all hover:scale-[1.02] shadow-sm {getEventClass(event)}"
                >
                  {event.staffName ? `${event.staffName}: ` : ''}{event.title}
                </button>
              {/each}
              {#if allDayEvents.length > 2}
                <button 
                  class="w-full text-center py-0.5 text-[10px] font-black text-on-surface-variant/60 hover:text-primary transition-colors"
                  onclick={() => onDateClick(date)}
                >
                  ... (+{allDayEvents.length - 2})
                </button>
              {/if}
            </div>
          {/each}
        </div>

        <!-- Scrollable Time Grid -->
        <div class="flex-1 overflow-y-auto custom-scrollbar relative">
          <div class="grid grid-cols-[60px_repeat(7,1fr)] min-h-[1440px] relative">
            <!-- Hour Labels -->
            <div class="flex flex-col">
              {#each hours as hour}
                <div class="h-[60px] text-[10px] font-bold text-on-surface-variant/60 flex items-start justify-center pt-1 border-r border-outline-variant/10">
                  {hour}:00
                </div>
              {/each}
            </div>

            <!-- Day Columns -->
            {#each calendarDays as { date }}
              {@const dayEvents = getEventsForDate(date)}
              <div 
                class="day-column relative border-r border-outline-variant/10 last:border-r-0 h-full overflow-hidden {isToday(date) ? 'bg-primary/[0.02]' : ''} transition-colors cursor-pointer select-none"
                onmousedown={(e) => handleMouseDown(date, e)}
                role="button"
                tabindex="0"
              >
                <!-- Hour Grid Lines -->
                {#each hours as _}
                  <div class="h-[30px] border-b border-outline-variant/5 hover:bg-primary/5 transition-colors"></div>
                  <div class="h-[30px] border-b border-outline-variant/10 hover:bg-primary/5 transition-colors"></div>
                {/each}

                <!-- Selection Overlay -->
                {#if isSelecting && selectionStart && selectionEnd}
                  {@const startT = selectionStart.date.getTime()}
                  {@const endT = selectionEnd.date.getTime()}
                  {@const currentT = date.getTime()}
                  
                  {#if (currentT >= startT && currentT <= endT) || (currentT <= startT && currentT >= endT)}
                    {@const isStartDay = currentT === startT}
                    {@const isEndDay = currentT === endT}
                    {@const top = isStartDay ? (selectionStart.minutes / (24 * 60)) * 100 : 0}
                    {@const bottom = isEndDay ? (selectionEnd.minutes / (24 * 60)) * 100 : 100}
                    {@const displayTop = Math.min(top, bottom)}
                    {@const displayHeight = Math.abs(bottom - top)}

                    <div 
                      class="absolute left-0 right-0 bg-primary/20 border-y-2 border-primary z-10 pointer-events-none"
                      style="top: {displayTop}%; height: {displayHeight}%"
                    >
                      {#if isStartDay}
                        <div class="p-1 text-[8px] font-black text-primary uppercase">
                           {Math.floor(selectionStart.minutes / 60)}:{selectionStart.minutes % 60 === 0 ? '00' : '30'} - ...
                        </div>
                      {/if}
                    </div>
                  {/if}
                {/if}

                <!-- Timed Events -->
                {#each getEventsForDate(date, 'timed') as event}
                  {@const styles = getEventStyles(event, dayEvents)}
                  <button 
                    onclick={(e) => { e.stopPropagation(); onEventClick(event); }}
                    onmousedown={(e) => e.stopPropagation()}
                    class="absolute rounded-lg p-2 text-[10px] font-black border shadow-lg transition-all hover:z-10 hover:scale-[1.02] flex flex-col gap-1 {getEventClass(event)}"
                    style="top: {styles.top}%; height: {styles.height}%; left: {styles.left}%; width: {styles.width}%; min-height: 24px;"
                  >
                    <div class="flex items-center gap-1">
                       {#if event.avatarUrl}
                         <img src={event.avatarUrl} alt="" class="w-3 h-3 rounded-full" />
                       {/if}
                       <span class="truncate">{event.staffName || 'Staff'}</span>
                    </div>
                    <span class="leading-tight opacity-90 truncate w-full">{event.title}</span>
                  </button>
                {/each}

                {#if isToday(date)}
                   <!-- Time Dot & Today Highlight -->
                   {@const now = new Date()}
                   {@const top = ((now.getHours() * 60 + now.getMinutes()) / (24 * 60)) * 100}
                   <div class="absolute -left-1 w-2.5 h-2.5 bg-red-500 rounded-full z-30 shadow-lg shadow-red-500/50" style="top: calc({top}% - 5px)"></div>
                {/if}
              </div>
            {/each}

            <!-- Global Time Line -->
            <div class="absolute left-[60px] right-0 h-0.5 bg-red-500/30 z-20 pointer-events-none" style="top: {getGlobalTimeTop()}%"></div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .calendar-container {
    user-select: none;
  }
</style>

