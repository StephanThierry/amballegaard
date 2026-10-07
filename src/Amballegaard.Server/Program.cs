using Amballegaard.Server;
using Amballegaard.Simulation;
using Amballegaard.Simulation.Agents;
using Amballegaard.Simulation.House;

var builder = WebApplication.CreateBuilder(args);

var housePath = builder.Configuration["HouseFile"]
    ?? Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "..", "..", "data", "house.json"));

builder.Services.AddSingleton(_ => HouseModel.Load(housePath));
builder.Services.AddSingleton(sp => new World(sp.GetRequiredService<HouseModel>(), Family.Create()));
builder.Services.AddSingleton<SimulationGate>();
builder.Services.AddHostedService<SimulationHost>();
builder.Services.AddSignalR();

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

// Rå house.json sendes uændret, så klienten også får tag, have m.m. som simulationen ikke bruger.
app.MapGet("/api/house", () => Results.File(housePath, "application/json"));
app.MapGet("/api/agents", (World world) => world.Agents.Select(a => a.ToInfo()));
app.MapGet("/api/state", (World world) => world.Snapshot());

app.MapHub<WorldHub>("/hubs/world");
app.MapFallbackToFile("index.html");

app.Run();
