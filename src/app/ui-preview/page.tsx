"use client";

import AppShell from "@/components/ui2/AppShell";
import Card, { CardHeader, CardContent } from "@/components/ui2/Card";
import Badge from "@/components/ui2/Badge";
import Button from "@/components/ui2/Button";
import Tabs, { TabsList, TabsTrigger, TabsContent } from "@/components/ui2/Tabs";

export default function UIPreviewPage() {
  return (
    <AppShell role="buyer" active="dashboard">
      <div className="p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-600">Active Requests</p>
                  <p className="text-2xl font-bold text-black mt-1">12</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                  <span className="text-2xl">📋</span>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-600">Pending Quotes</p>
                  <p className="text-2xl font-bold text-black mt-1">8</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center">
                  <span className="text-2xl">💬</span>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-600">Active Orders</p>
                  <p className="text-2xl font-bold text-black mt-1">5</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                  <span className="text-2xl">📦</span>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-600">Suppliers</p>
                  <p className="text-2xl font-bold text-black mt-1">24</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                  <span className="text-2xl">🏢</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content with Tabs */}
        <Tabs defaultValue="requests">
          <TabsList>
            <TabsTrigger value="requests">Material Requests</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          </TabsList>

          <TabsContent value="requests">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-black">
                    Recent Requests
                  </h3>
                  <Button size="sm">New Request</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-zinc-200">
                        <th className="text-left py-3 px-4 text-sm font-medium text-zinc-600">
                          Request ID
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-zinc-600">
                          Material
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-zinc-600">
                          Status
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-zinc-600">
                          Quotes
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-zinc-600">
                          Created
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { id: "REQ-001", material: "Lumber - 2x4", status: "Open", quotes: 3, created: "2 hours ago" },
                        { id: "REQ-002", material: "Roofing Shingles", status: "Awarded", quotes: 5, created: "1 day ago" },
                        { id: "REQ-003", material: "Concrete Mix", status: "Open", quotes: 2, created: "2 days ago" },
                        { id: "REQ-004", material: "Steel Beams", status: "Closed", quotes: 4, created: "3 days ago" },
                      ].map((request) => (
                        <tr
                          key={request.id}
                          className="border-b border-zinc-100 hover:bg-zinc-50"
                        >
                          <td className="py-3 px-4 text-sm text-black font-medium">
                            {request.id}
                          </td>
                          <td className="py-3 px-4 text-sm text-zinc-700">
                            {request.material}
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              variant={
                                request.status === "Open"
                                  ? "info"
                                  : request.status === "Awarded"
                                  ? "success"
                                  : "default"
                              }
                            >
                              {request.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-sm text-zinc-700">
                            {request.quotes}
                          </td>
                          <td className="py-3 px-4 text-sm text-zinc-600">
                            {request.created}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orders">
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-black">
                  Active Orders
                </h3>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { id: "ORD-001", supplier: "ABC Materials", status: "Confirmed", delivery: "Jan 25" },
                    { id: "ORD-002", supplier: "XYZ Supply", status: "Scheduled", delivery: "Jan 28" },
                    { id: "ORD-003", supplier: "Build Co", status: "Delivered", delivery: "Jan 20" },
                  ].map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center justify-between p-4 border border-zinc-200 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-black">{order.id}</p>
                        <p className="text-sm text-zinc-600">{order.supplier}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant={order.status === "Delivered" ? "success" : "info"}>
                          {order.status}
                        </Badge>
                        <span className="text-sm text-zinc-600">
                          {order.delivery}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="suppliers">
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-black">
                  Supplier Directory
                </h3>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { name: "ABC Materials", category: "Lumber", rating: "4.8" },
                    { name: "XYZ Supply", category: "Concrete", rating: "4.6" },
                    { name: "Build Co", category: "General", rating: "4.9" },
                    { name: "Steel Works", category: "Metal", rating: "4.7" },
                    { name: "Roof Pro", category: "Roofing", rating: "4.5" },
                    { name: "Hardware Plus", category: "General", rating: "4.8" },
                  ].map((supplier) => (
                    <div
                      key={supplier.name}
                      className="p-4 border border-zinc-200 rounded-lg"
                    >
                      <h4 className="font-medium text-black">{supplier.name}</h4>
                      <p className="text-sm text-zinc-600 mt-1">{supplier.category}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-sm text-zinc-600">⭐ {supplier.rating}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

