// components/dashboard/header.tsx
"use client"

import { Bell, Search } from "lucide-react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ModeToggle } from "@/components/mode-toggle"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export function DashboardHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center gap-3 px-4 md:px-6">
        <SidebarTrigger className="md:flex" />

        <div className="relative hidden w-full max-w-md md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search dashboard..." className="pl-9" />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ModeToggle />

          <Button variant="outline" size="icon">
            <Bell className="h-4 w-4" />
            <span className="sr-only">Notifications</span>
          </Button>

          <Avatar className="h-9 w-9">
            <AvatarImage src="/avatar.png" alt="User avatar" />
            <AvatarFallback>ML</AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  )
}