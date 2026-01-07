import { describe, it, expect } from 'vitest'
import {
    runBenchmarkSuite,
    formatResults,
    benchmark,
    MapStorage,
    TypedArrayStorage,
    DenseArrayStorage,
    gravityWithMaps,
    gravityWithTypedArrays,
    gravityWithDenseArrays
} from './Benchmark'

describe('ECS Performance Benchmarks', () => {
    it('should run gravity benchmarks and show results', () => {
        console.log('\n' + '='.repeat(80))
        console.log('ECS PERFORMANCE BENCHMARKS')
        console.log('='.repeat(80) + '\n')

        const suites = runBenchmarkSuite([100, 300, 500, 1000])

        for (const suite of suites) {
            console.log(`\n### ${suite.name} ###\n`)
            console.log(formatResults(suite.results))

            // Calculate speedup
            const mapResult = suite.results.find(r => r.name.includes('Map'))!
            const typedResult = suite.results.find(r => r.name.includes('TypedArray'))!
            const denseResult = suite.results.find(r => r.name.includes('Dense'))!

            const typedSpeedup = mapResult.avgMs / typedResult.avgMs
            const denseSpeedup = mapResult.avgMs / denseResult.avgMs

            console.log(`\nSpeedup vs Map Storage:`)
            console.log(`  TypedArray SOA: ${typedSpeedup.toFixed(2)}x faster`)
            console.log(`  Dense Array:    ${denseSpeedup.toFixed(2)}x faster`)
        }

        console.log('\n' + '='.repeat(80) + '\n')

        // Just ensure benchmarks ran without error
        expect(suites.length).toBeGreaterThan(0)
    })

    it('should benchmark component access patterns', () => {
        const count = 1000
        const iterations = 10000

        // Setup
        const mapStorage = new MapStorage()
        const typedStorage = new TypedArrayStorage(count)
        const denseStorage = new DenseArrayStorage(count)

        for (let i = 0; i < count; i++) {
            mapStorage.add(i, i, i, 0, 0, 1)
            typedStorage.add(i, i, i, 0, 0, 1)
            denseStorage.add(i, i, i, 0, 0, 1)
        }

        console.log('\n### Component Access Patterns (1000 entities, 10000 iterations) ###\n')

        // Random access read
        const randomIds = Array.from({ length: iterations }, () => Math.floor(Math.random() * count))

        const mapRead = benchmark(
            'Map: Random Read',
            () => {
                for (const id of randomIds) {
                    mapStorage.getPos(id)
                }
            },
            1,
            count
        )

        const typedRead = benchmark(
            'TypedArray: Random Read',
            () => {
                for (const id of randomIds) {
                    typedStorage.getPos(id)
                }
            },
            1,
            count
        )

        const denseRead = benchmark(
            'Dense: Random Read',
            () => {
                for (const id of randomIds) {
                    denseStorage.getPos(id)
                }
            },
            1,
            count
        )

        console.log(formatResults([mapRead, typedRead, denseRead]))

        // Sequential iteration
        console.log('\n### Sequential Iteration ###\n')

        const mapIter = benchmark(
            'Map: Sequential Iter',
            () => {
                for (let i = 0; i < count; i++) {
                    mapStorage.getPos(i)
                    mapStorage.getVel(i)
                    mapStorage.getMass(i)
                }
            },
            iterations / 10,
            count
        )

        const typedIter = benchmark(
            'TypedArray: Sequential Iter',
            () => {
                const { posX, posY, velX, velY, mass } = typedStorage
                for (let i = 0; i < count; i++) {
                    const _ = posX[i] + posY[i] + velX[i] + velY[i] + mass[i]
                }
            },
            iterations / 10,
            count
        )

        const denseIter = benchmark(
            'Dense: Sequential Iter',
            () => {
                const { posX, posY, velX, velY, mass } = denseStorage
                for (let i = 0; i < count; i++) {
                    const _ = posX[i] + posY[i] + velX[i] + velY[i] + mass[i]
                }
            },
            iterations / 10,
            count
        )

        console.log(formatResults([mapIter, typedIter, denseIter]))

        expect(true).toBe(true)
    })

    it('should benchmark query patterns', () => {
        console.log('\n### Query Pattern Benchmarks ###\n')

        const count = 1000
        const iterations = 1000

        // Simulate current World.query() behavior
        const entityIds = new Set(Array.from({ length: count }, (_, i) => i))
        const componentA = new Map(Array.from({ length: count }, (_, i) => [i, { x: i, y: i }]))
        const componentB = new Map(Array.from({ length: count }, (_, i) => [i, i * 2]))
        const componentC = new Map(Array.from({ length: Math.floor(count / 2) }, (_, i) => [i * 2, i]))

        // Current approach: Array.from + filter
        const currentQuery = benchmark(
            'Current: Array.from + filter',
            () => {
                const keys = Array.from(componentC.keys())
                const result = keys.filter(id =>
                    componentA.has(id) && componentB.has(id)
                )
                return result
            },
            iterations,
            count
        )

        // Pre-cached entity list (archetype approach)
        const cachedEntities = Array.from(componentC.keys()).filter(id =>
            componentA.has(id) && componentB.has(id)
        )

        const cachedQuery = benchmark(
            'Cached: Pre-computed list',
            () => {
                return cachedEntities
            },
            iterations,
            count
        )

        // TypedArray index list
        const indexArray = new Uint32Array(cachedEntities)

        const typedQuery = benchmark(
            'TypedArray: Index list',
            () => {
                return indexArray
            },
            iterations,
            count
        )

        console.log(formatResults([currentQuery, cachedQuery, typedQuery]))

        const speedup = currentQuery.avgMs / cachedQuery.avgMs
        console.log(`\nCached query is ${speedup.toFixed(0)}x faster than current approach`)

        expect(true).toBe(true)
    })
})
