"use client";
import { useCallback, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminUsers, type AdminUsersFilters } from "@/hooks/useAdminUsers";
import { useAdminTenants } from "@/hooks/useAdminTenants";
import {
  UsersTableAdmin,
  UsersTableAdminSkeleton,
} from "@/components/admin/users/UsersTableAdmin";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UsersClient() {
  const [filters, setFilters] = useState<AdminUsersFilters>({});
  const [inputValue, setInputValue] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load tenants for the tenant select filter
  const { data: tenantsData } = useAdminTenants({});
  const tenants = (tenantsData?.pages ?? [])
    .flatMap((p) => p.data ?? [])
    .map((t) => ({ id: t.id, slug: t.slug, display_name: t.display_name }));

  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useAdminUsers(filters);

  const rows = data?.pages.flatMap((p) => p.data ?? []) ?? [];
  const total = rows.length;

  const handleSearch = useCallback(
    (value: string) => {
      setInputValue(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setFilters((prev) => ({ ...prev, q: value || undefined }));
      }, 300);
    },
    [],
  );

  const handleTenant = useCallback((value: string) => {
    setFilters((prev) => ({
      ...prev,
      tenant_id: value === "all" ? undefined : value,
    }));
  }, []);

  const handleRole = useCallback((value: string) => {
    setFilters((prev) => ({
      ...prev,
      role:
        value === "all"
          ? undefined
          : (value as AdminUsersFilters["role"]),
    }));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isLoading
            ? "Carregando..."
            : `${total} usuário${total !== 1 ? "s" : ""}${hasNextPage ? "+" : ""}`}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <Input
          placeholder="Buscar por email ou nome..."
          value={inputValue}
          onChange={(e) => handleSearch(e.target.value)}
          className="sm:w-72"
          aria-label="Buscar usuários"
        />

        <Select
          value={filters.tenant_id ?? "all"}
          onValueChange={handleTenant}
        >
          <SelectTrigger className="sm:w-52" aria-label="Filtrar por tenant">
            <SelectValue placeholder="Tenant" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tenants</SelectItem>
            {tenants.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.role ?? "all"} onValueChange={handleRole}>
          <SelectTrigger className="sm:w-40" aria-label="Filtrar por role">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="agent">Agente</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <UsersTableAdminSkeleton />
      ) : (
        <UsersTableAdmin
          data={rows}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={() => void fetchNextPage()}
        />
      )}
    </div>
  );
}
