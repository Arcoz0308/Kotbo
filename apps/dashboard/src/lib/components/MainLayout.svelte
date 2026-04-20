<script lang="ts">
  import Sidebar from './Sidebar.svelte';
  import Navbar from './Navbar.svelte';
</script>

<div class="flex min-h-screen bg-background text-on-background transition-colors duration-500 relative overflow-hidden">
  
  <div class="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.07] overflow-hidden">
    <div class="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-primary rounded-full blur-[150px] animate-mesh"></div>
    <div class="absolute top-[40%] -right-[10%] w-[50%] h-[50%] bg-secondary rounded-full blur-[120px] animate-mesh" style="animation-delay: -7s"></div>
  </div>

  
  <div class="absolute inset-0 pointer-events-none opacity-[0.015] dark:opacity-[0.03]"></div>

  <Sidebar />
  
  <div class="flex-1 ml-64 flex flex-col">
    <Navbar />
    
    <main class="p-12 pb-24 max-w-[1600px] w-full mx-auto">
      <slot />
    </main>
  </div>
</div>
