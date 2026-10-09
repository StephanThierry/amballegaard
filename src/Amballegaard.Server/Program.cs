using Amballegaard.Server;
using Amballegaard.Simulation;
using Amballegaard.Simulation.Agents;
using Amballegaard.Simulation.Events;
using Amballegaard.Simulation.House;

var builder = WebApplication.CreateBuilder(args);

var housePath = builder.Configuration["HouseFile"]
    ?? Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "..", "..", "data", "house.json"));
var eventIndexPath = builder.Configuration["EventIndexFile"]
    ?? Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "..", "..", "data", "events", "index.json"));

var house = HouseModel.Load(housePath);
var agents = Family.Create();
// Dagsplan-motorens ID-indeks (docs/dagsplan-motor.md §9.2) regenereres ved hver opstart, så den
// aldrig kan gå ud af sync med house.json/Family — ingen manuel vedligeholdelse nødvendig.
EventIndexWriter.Write(house, agents, eventIndexPath);

builder.Services.AddSingleton(house);
builder.Services.AddSingleton(_ => new World(house, agents));
builder.Services.AddSingleton<SimulationGate>();
builder.Services.AddHostedService<SimulationHost>();
builder.Services.AddSignalR();

var app = builder.Build();

app.UseDefaultFiles();
// 3D-assets som ASP.NET ikke kender — ukendte filtyper giver ellers 404, og så crasher scenen (HDRI, glTF-modeller).
var contentTypes = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider();
contentTypes.Mappings[".hdr"] = "image/vnd.radiance";
contentTypes.Mappings[".gltf"] = "model/gltf+json";
contentTypes.Mappings[".glb"] = "model/gltf-binary";
contentTypes.Mappings[".bin"] = "application/octet-stream";
app.UseStaticFiles(new StaticFileOptions { ContentTypeProvider = contentTypes });

// Rå house.json sendes uændret, så klienten også får tag, have m.m. som simulationen ikke bruger.
app.MapGet("/api/house", () => Results.File(housePath, "application/json"));
app.MapGet("/api/agents", (World world) => world.Agents.Select(a => a.ToInfo()));
// Standard-figurstil for nye besøgende (hver bruger kan vælge en anden i sin egen browser).
app.MapGet("/api/config", (IConfiguration cfg) => new { defaultAvatarStyle = cfg["DefaultAvatarStyle"] ?? "voxel" });
app.MapGet("/api/state", (World world) => world.Snapshot());

app.MapHub<WorldHub>("/hubs/world");
app.MapFallbackToFile("index.html");

app.Run();
